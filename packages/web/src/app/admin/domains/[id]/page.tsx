'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AddUserModal,
  CreateGroupModal,
  CreateIdentityModal,
  ReserveHandleModal,
  IssueCertificateModal,
} from '@/components/admin/domains';

type Tab = 'overview' | 'users' | 'groups' | 'services' | 'identity' | 'sso' | 'certificates' | 'clusters' | 'platform' | 'federation' | 'branding';

export default function DomainDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', id],
    queryFn: () => api.adminDomainsGet(id),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof api.adminDomainsUpdate>[0]) =>
      api.adminDomainsUpdate(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', id] });
      toast.success('Domain updated');
    },
    onError: () => {
      toast.error('Failed to update domain');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.adminDomainsVerify(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', id] });
      toast.success('Domain verified');
    },
    onError: () => {
      toast.error('Failed to verify domain');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.adminDomainsDelete(id),
    onSuccess: () => {
      toast.success('Domain deleted');
      router.push('/admin/domains');
    },
    onError: () => {
      toast.error('Failed to delete domain');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Domain not found</p>
        <Link href="/admin/domains" className="text-accent hover:underline mt-2 inline-block">
          Back to domains
        </Link>
      </div>
    );
  }

  const domain = data.domain;

  const tabs: { id: Tab; label: string; show?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'groups', label: 'Groups' },
    { id: 'services', label: 'Services' },
    { id: 'identity', label: 'Identity (PLC)' },
    { id: 'sso', label: 'SSO' },
    { id: 'certificates', label: 'Certificates' },
    { id: 'clusters', label: 'Clusters' },
    { id: 'platform', label: 'Platform Services' },
    { id: 'federation', label: 'Federation', show: domain.type === 'federated' },
    { id: 'branding', label: 'Branding' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'pending':
      case 'verifying':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'suspended':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/domains"
            className="p-2 text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">{domain.name}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                  domain.status
                )}`}
              >
                {domain.status.charAt(0).toUpperCase() + domain.status.slice(1)}
              </span>
            </div>
            <p className="text-text-muted mt-1">{domain.domain}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {domain.status === 'pending' && (
            <button
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              Verify Domain
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this domain? This action cannot be undone.')) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {tabs
            .filter((tab) => tab.show !== false)
            .map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <OverviewTab
            domain={domain}
            userStats={data.userStats}
            groupCount={data.groupCount}
            intermediateCert={data.intermediateCert}
            entityCertCount={data.entityCertCount}
            recentActivity={data.recentActivity}
          />
        )}
        {activeTab === 'users' && <UsersTab domainId={id} />}
        {activeTab === 'groups' && <GroupsTab domainId={id} />}
        {activeTab === 'services' && (
          <ServicesTab
            domainId={id}
            features={domain.features}
            rateLimits={domain.rateLimits}
            onUpdate={(updates) => updateMutation.mutate({ id, ...updates })}
            isUpdating={updateMutation.isPending}
          />
        )}
        {activeTab === 'identity' && (
          <IdentityTab
            domainId={id}
            domain={domain.domain}
            plcConfig={domain.plcConfig}
            identityCount={domain.identityCount || 0}
            handleSuffix={domain.handleSuffix}
            onUpdate={(plcConfig) => updateMutation.mutate({ id, plcConfig })}
            isUpdating={updateMutation.isPending}
          />
        )}
        {activeTab === 'sso' && <SSOTab domainId={id} domainName={domain.domain} />}
        {activeTab === 'certificates' && (
          <CertificatesTab
            domainId={id}
            domain={domain.domain}
            intermediateCert={data.intermediateCert}
            entityCertCount={data.entityCertCount}
          />
        )}
        {activeTab === 'clusters' && <ClustersTab domainId={id} />}
        {activeTab === 'platform' && <PlatformServicesTab domainId={id} domain={domain.domain} />}
        {activeTab === 'federation' && domain.type === 'federated' && (
          <FederationTab
            domain={domain}
            onUpdate={(updates) => updateMutation.mutate({ id, ...updates })}
            isUpdating={updateMutation.isPending}
          />
        )}
        {activeTab === 'branding' && (
          <BrandingTab
            branding={domain.branding}
            onUpdate={(branding) => updateMutation.mutate({ id, branding })}
            isUpdating={updateMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({
  domain,
  userStats,
  groupCount,
  intermediateCert,
  entityCertCount,
  recentActivity,
}: {
  domain: any;
  userStats: Record<string, number>;
  groupCount: number;
  intermediateCert: any;
  entityCertCount: number;
  recentActivity: any[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Domain Info */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Domain Information</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-text-muted">Domain</dt>
              <dd className="text-text-primary font-medium">{domain.domain}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Type</dt>
              <dd className="text-text-primary font-medium capitalize">{domain.type}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Handle Suffix</dt>
              <dd className="text-text-primary font-medium">{domain.handleSuffix || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Created</dt>
              <dd className="text-text-primary font-medium">
                {new Date(domain.createdAt).toLocaleDateString()}
              </dd>
            </div>
            {domain.verifiedAt && (
              <div>
                <dt className="text-sm text-text-muted">Verified</dt>
                <dd className="text-text-primary font-medium">
                  {new Date(domain.verifiedAt).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* DNS Verification */}
        {domain.status === 'pending' && domain.dnsVerificationToken && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-yellow-400 mb-4">DNS Verification Required</h2>
            <p className="text-text-secondary mb-4">
              Add the following TXT record to your domain's DNS settings:
            </p>
            <div className="bg-background rounded-lg p-4 font-mono text-sm">
              <p className="text-text-muted mb-1">Record Type: TXT</p>
              <p className="text-text-muted mb-1">Host: _exprsn-verify</p>
              <p className="text-text-primary break-all">{domain.dnsVerificationToken}</p>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-text-muted">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent mt-2" />
                  <div className="flex-1">
                    <p className="text-text-primary text-sm">
                      {formatActivityAction(activity.action)}
                    </p>
                    <p className="text-text-muted text-xs">
                      {new Date(activity.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats Sidebar */}
      <div className="space-y-6">
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Stats</h2>
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-bold text-text-primary">{domain.userCount}</p>
              <p className="text-text-muted text-sm">Total Users</p>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-text-muted text-sm mb-2">By Role:</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Admins</span>
                  <span className="text-text-primary">{userStats.admin || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Moderators</span>
                  <span className="text-text-primary">{userStats.moderator || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Members</span>
                  <span className="text-text-primary">{userStats.member || 0}</span>
                </div>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex justify-between">
                <span className="text-text-muted text-sm">Groups</span>
                <span className="text-text-primary font-medium">{groupCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Certificates</h2>
          {intermediateCert ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-text-muted">Intermediate CA</p>
                <p className="text-text-primary font-medium">{intermediateCert.commonName}</p>
                <p className="text-xs text-text-muted">
                  Expires: {new Date(intermediateCert.notAfter).toLocaleDateString()}
                </p>
              </div>
              <div className="pt-3 border-t border-border">
                <p className="text-2xl font-bold text-text-primary">{entityCertCount}</p>
                <p className="text-text-muted text-sm">Entity Certificates</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-text-muted mb-3">No intermediate CA configured</p>
              <button className="text-accent hover:underline text-sm">
                Generate Intermediate CA
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              href={`/admin/domains/${domain.id}/users`}
              className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover hover:bg-background transition-colors group"
            >
              <UsersIcon className="w-5 h-5 text-text-muted group-hover:text-accent" />
              <div className="flex-1">
                <p className="text-text-primary text-sm font-medium">Manage Users</p>
                <p className="text-text-muted text-xs">View and manage domain users</p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-text-muted" />
            </Link>
            <Link
              href={`/admin/domains/${domain.id}/moderation`}
              className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover hover:bg-background transition-colors group"
            >
              <ShieldIcon className="w-5 h-5 text-text-muted group-hover:text-accent" />
              <div className="flex-1">
                <p className="text-text-primary text-sm font-medium">Moderation</p>
                <p className="text-text-muted text-xs">Queue, banned words & tags</p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-text-muted" />
            </Link>
            <Link
              href={`/admin/domains/${domain.id}/reports`}
              className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover hover:bg-background transition-colors group"
            >
              <FlagIcon className="w-5 h-5 text-text-muted group-hover:text-accent" />
              <div className="flex-1">
                <p className="text-text-primary text-sm font-medium">Reports</p>
                <p className="text-text-muted text-xs">User reports and appeals</p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-text-muted" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Users Tab Component
function UsersTab({ domainId }: { domainId: string }) {
  const [showAddUser, setShowAddUser] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'users'],
    queryFn: () => api.adminDomainsUsersList(domainId),
  });

  const removeMutation = useMutation({
    mutationFn: (userDid: string) => api.adminDomainsUsersRemove(domainId, userDid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('User removed');
    },
    onError: () => {
      toast.error('Failed to remove user');
    },
  });

  const users = data?.users || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-text-primary">Domain Users</h2>
        <button
          onClick={() => setShowAddUser(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
        >
          Add User
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <p className="text-text-muted">No users assigned to this domain</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">Added</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
                        {user.user?.avatar ? (
                          <img src={user.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-text-muted text-sm">
                            {user.user?.handle?.[0]?.toUpperCase() || '?'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-text-primary font-medium">{user.user?.displayName || user.user?.handle}</p>
                        <p className="text-text-muted text-sm">@{user.user?.handle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="capitalize text-text-secondary">{user.role}</span>
                  </td>
                  <td className="px-6 py-4 text-text-muted text-sm">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => {
                        if (confirm('Remove this user from the domain?')) {
                          removeMutation.mutate(user.userDid);
                        }
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddUserModal
        domainId={domainId}
        isOpen={showAddUser}
        onClose={() => setShowAddUser(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
          setShowAddUser(false);
        }}
      />
    </div>
  );
}

// Groups Tab Component
function GroupsTab({ domainId }: { domainId: string }) {
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'groups'],
    queryFn: () => api.adminDomainsGroupsList(domainId),
  });

  const deleteMutation = useMutation({
    mutationFn: (groupId: string) => api.adminDomainsGroupsDelete(groupId, domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Group deleted');
    },
    onError: () => {
      toast.error('Failed to delete group');
    },
  });

  const groups = data?.groups || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-text-primary">Domain Groups</h2>
        <button
          onClick={() => setShowCreateGroup(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
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
          <p className="text-text-muted">No groups in this domain</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <div key={group.id} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-text-primary">{group.name}</h3>
                  {group.description && (
                    <p className="text-sm text-text-muted mt-1">{group.description}</p>
                  )}
                </div>
                {group.isDefault && (
                  <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded">Default</span>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-text-muted">{group.memberCount} members</span>
                <button
                  onClick={() => {
                    if (confirm('Delete this group?')) {
                      deleteMutation.mutate(group.id);
                    }
                  }}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateGroupModal
        domainId={domainId}
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
          setShowCreateGroup(false);
        }}
      />
    </div>
  );
}

// Services Tab Component
function ServicesTab({
  domainId,
  features,
  rateLimits,
  onUpdate,
  isUpdating,
}: {
  domainId: string;
  features?: Record<string, boolean>;
  rateLimits?: Record<string, number>;
  onUpdate: (updates: { features?: Record<string, boolean>; rateLimits?: Record<string, number> }) => void;
  isUpdating: boolean;
}) {
  const [localFeatures, setLocalFeatures] = useState(features || {});
  const [localLimits, setLocalLimits] = useState(rateLimits || {});

  const featureList = [
    { key: 'videoHosting', label: 'Video Hosting', description: 'Enable video upload and hosting' },
    { key: 'liveStreaming', label: 'Live Streaming', description: 'Enable live streaming capabilities' },
    { key: 'messaging', label: 'Messaging', description: 'Enable direct messaging' },
    { key: 'feedGeneration', label: 'Feed Generation', description: 'Enable custom feed algorithms' },
    { key: 'customBranding', label: 'Custom Branding', description: 'Allow custom branding options' },
    { key: 'apiAccess', label: 'API Access', description: 'Enable external API access' },
    { key: 'analytics', label: 'Analytics', description: 'Enable analytics dashboard' },
  ];

  const handleSave = () => {
    onUpdate({ features: localFeatures, rateLimits: localLimits });
  };

  return (
    <div className="space-y-6">
      {/* Features */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Features</h2>
        <div className="space-y-4">
          {featureList.map((feature) => (
            <div key={feature.key} className="flex items-center justify-between">
              <div>
                <p className="text-text-primary font-medium">{feature.label}</p>
                <p className="text-text-muted text-sm">{feature.description}</p>
              </div>
              <button
                onClick={() =>
                  setLocalFeatures((prev) => ({ ...prev, [feature.key]: !prev[feature.key] }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  localFeatures[feature.key] ? 'bg-accent' : 'bg-surface-hover'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    localFeatures[feature.key] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Rate Limits */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Rate Limits</h2>
        <p className="text-text-muted text-sm mb-4">
          Configure API rate limits for this domain. Users in this domain will be subject to these limits.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Requests per minute</label>
            <input
              type="number"
              value={localLimits.requestsPerMinute || 60}
              onChange={(e) =>
                setLocalLimits((prev) => ({ ...prev, requestsPerMinute: parseInt(e.target.value) }))
              }
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">Default: 60 (platform default)</p>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Burst limit</label>
            <input
              type="number"
              value={localLimits.burstLimit || 20}
              onChange={(e) =>
                setLocalLimits((prev) => ({ ...prev, burstLimit: parseInt(e.target.value) }))
              }
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">Max concurrent requests before throttling</p>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Requests per hour</label>
            <input
              type="number"
              value={localLimits.requestsPerHour || 1000}
              onChange={(e) =>
                setLocalLimits((prev) => ({ ...prev, requestsPerHour: parseInt(e.target.value) }))
              }
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Daily upload limit</label>
            <input
              type="number"
              value={localLimits.dailyUploadLimit || 100}
              onChange={(e) =>
                setLocalLimits((prev) => ({ ...prev, dailyUploadLimit: parseInt(e.target.value) }))
              }
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Storage quota (GB)</label>
            <input
              type="number"
              value={localLimits.storageQuotaGb || 10}
              onChange={(e) =>
                setLocalLimits((prev) => ({ ...prev, storageQuotaGb: parseInt(e.target.value) }))
              }
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isUpdating}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {isUpdating ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// Certificates Tab Component
function CertificatesTab({
  domainId,
  domain,
  intermediateCert,
  entityCertCount,
}: {
  domainId: string;
  domain: string;
  intermediateCert: any;
  entityCertCount: number;
}) {
  const [showIssueCertModal, setShowIssueCertModal] = useState(false);
  const [certTypeFilter, setCertTypeFilter] = useState<'all' | 'client' | 'server' | 'code_signing'>('all');
  const queryClient = useQueryClient();

  // Fetch entity certificates for this domain
  const { data: certsData, isLoading: certsLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'certificates'],
    queryFn: async () => {
      // This would call the API to get domain certificates
      // For now, return mock structure
      return { certificates: [] as any[] };
    },
  });

  const certificates = certsData?.certificates || [];
  const filteredCerts = certTypeFilter === 'all'
    ? certificates
    : certificates.filter((c: any) => c.certType === certTypeFilter);

  const getCertStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'revoked': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'expired': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const getCertTypeColor = (type: string) => {
    switch (type) {
      case 'client': return 'bg-blue-500/10 text-blue-400';
      case 'server': return 'bg-purple-500/10 text-purple-400';
      case 'code_signing': return 'bg-orange-500/10 text-orange-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Intermediate CA */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Intermediate CA</h2>
          {intermediateCert && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              intermediateCert.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {intermediateCert.status}
            </span>
          )}
        </div>
        {intermediateCert ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <dt className="text-sm text-text-muted">Common Name</dt>
                <dd className="text-text-primary font-medium">{intermediateCert.commonName}</dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">Serial Number</dt>
                <dd className="text-text-primary font-mono text-sm truncate">{intermediateCert.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">Valid From</dt>
                <dd className="text-text-primary">{new Date(intermediateCert.notBefore).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">Valid Until</dt>
                <dd className="text-text-primary">{new Date(intermediateCert.notAfter).toLocaleDateString()}</dd>
              </div>
            </dl>
            <div className="pt-4 border-t border-border">
              <dt className="text-sm text-text-muted mb-1">Fingerprint (SHA-256)</dt>
              <dd className="text-text-secondary font-mono text-xs break-all bg-background p-2 rounded">
                {intermediateCert.fingerprint || 'N/A'}
              </dd>
            </div>
            <div className="flex gap-2 pt-2">
              <button className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-surface text-text-primary rounded transition-colors">
                Download Certificate
              </button>
              <button className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-surface text-text-primary rounded transition-colors">
                View Chain
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <CertificateIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted mb-4">No intermediate CA configured for this domain</p>
            <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors">
              Generate Intermediate CA
            </button>
          </div>
        )}
      </div>

      {/* Entity Certificates */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Entity Certificates</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {entityCertCount} certificate{entityCertCount !== 1 ? 's' : ''} issued
            </p>
          </div>
          <button
            onClick={() => setShowIssueCertModal(true)}
            disabled={!intermediateCert}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Issue Certificate
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex gap-2 mb-4">
          {(['all', 'client', 'server', 'code_signing'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setCertTypeFilter(type)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                certTypeFilter === type
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {type === 'all' ? 'All Types' : type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Certificates List */}
        {certsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredCerts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <CertificateIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">
              {certificates.length === 0
                ? 'No certificates issued yet'
                : 'No certificates match the filter'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Common Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Expires</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCerts.map((cert: any) => (
                  <tr key={cert.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-text-primary font-medium">{cert.commonName}</p>
                        <p className="text-xs text-text-muted font-mono">{cert.serialNumber?.slice(0, 16)}...</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCertTypeColor(cert.certType)}`}>
                        {cert.certType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getCertStatusColor(cert.status)}`}>
                        {cert.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted">
                      {new Date(cert.notAfter).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="text-accent hover:text-accent-hover text-sm">View</button>
                        {cert.status === 'active' && (
                          <button className="text-red-400 hover:text-red-300 text-sm">Revoke</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Certificate Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-400">
            {certificates.filter((c: any) => c.status === 'active').length}
          </p>
          <p className="text-sm text-text-muted">Active</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">
            {certificates.filter((c: any) => c.certType === 'client').length}
          </p>
          <p className="text-sm text-text-muted">Client Certs</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">
            {certificates.filter((c: any) => c.certType === 'server').length}
          </p>
          <p className="text-sm text-text-muted">Server Certs</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-400">
            {certificates.filter((c: any) => c.status === 'revoked').length}
          </p>
          <p className="text-sm text-text-muted">Revoked</p>
        </div>
      </div>

      {/* Issue Certificate Modal */}
      {intermediateCert && (
        <IssueCertificateModal
          domainId={domainId}
          domain={domain}
          intermediateCertId={intermediateCert.id}
          isOpen={showIssueCertModal}
          onClose={() => setShowIssueCertModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'certificates'] });
            setShowIssueCertModal(false);
          }}
        />
      )}
    </div>
  );
}

function CertificateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

// Federation Tab Component
function FederationTab({
  domain,
  onUpdate,
  isUpdating,
}: {
  domain: any;
  onUpdate: (updates: { pdsEndpoint?: string }) => void;
  isUpdating: boolean;
}) {
  const [pdsEndpoint, setPdsEndpoint] = useState(domain.pdsEndpoint || '');

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Federation Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">PDS Endpoint</label>
            <input
              type="text"
              value={pdsEndpoint}
              onChange={(e) => setPdsEndpoint(e.target.value)}
              placeholder="https://pds.example.com"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          {domain.federationDid && (
            <div>
              <label className="block text-sm text-text-muted mb-1">Federation DID</label>
              <p className="text-text-primary font-mono text-sm">{domain.federationDid}</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => onUpdate({ pdsEndpoint })}
            disabled={isUpdating}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isUpdating ? 'Saving...' : 'Save'}
          </button>
          <button className="px-4 py-2 bg-surface-hover hover:bg-surface text-text-primary rounded-lg transition-colors">
            Test Connection
          </button>
        </div>
      </div>
    </div>
  );
}

// Branding Tab Component
function BrandingTab({
  branding,
  onUpdate,
  isUpdating,
}: {
  branding?: Record<string, string>;
  onUpdate: (branding: Record<string, string>) => void;
  isUpdating: boolean;
}) {
  const [localBranding, setLocalBranding] = useState(branding || {});

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Custom Branding</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Logo URL</label>
            <input
              type="text"
              value={localBranding.logo || ''}
              onChange={(e) => setLocalBranding((prev) => ({ ...prev, logo: e.target.value }))}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Favicon URL</label>
            <input
              type="text"
              value={localBranding.favicon || ''}
              onChange={(e) => setLocalBranding((prev) => ({ ...prev, favicon: e.target.value }))}
              placeholder="https://example.com/favicon.ico"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Primary Color</label>
              <input
                type="color"
                value={localBranding.primaryColor || '#6366f1'}
                onChange={(e) => setLocalBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                className="w-full h-10 bg-background border border-border rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Secondary Color</label>
              <input
                type="color"
                value={localBranding.secondaryColor || '#8b5cf6'}
                onChange={(e) => setLocalBranding((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                className="w-full h-10 bg-background border border-border rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
        <div className="mt-6">
          <button
            onClick={() => onUpdate(localBranding)}
            disabled={isUpdating}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isUpdating ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Identity (PLC) Tab Component
function IdentityTab({
  domainId,
  domain,
  plcConfig,
  identityCount,
  handleSuffix,
  onUpdate,
  isUpdating,
}: {
  domainId: string;
  domain?: string;
  plcConfig?: {
    enabled: boolean;
    mode: 'standalone' | 'external';
    externalPlcUrl?: string;
    allowCustomHandles: boolean;
    requireInviteCode: boolean;
    defaultPdsEndpoint?: string;
    handleValidationRules?: {
      minLength: number;
      maxLength: number;
      allowedCharacters: string;
      reservedHandles: string[];
    };
    orgHandleSuffixes?: Record<string, string>;
  };
  identityCount: number;
  handleSuffix?: string;
  onUpdate: (plcConfig: any) => void;
  isUpdating: boolean;
}) {
  const [localConfig, setLocalConfig] = useState(plcConfig || {
    enabled: true,
    mode: 'standalone' as const,
    allowCustomHandles: false,
    requireInviteCode: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'tombstoned'>('all');
  const [showCreateIdentity, setShowCreateIdentity] = useState(false);
  const [showReserveHandle, setShowReserveHandle] = useState(false);
  const queryClient = useQueryClient();

  // Set default PDS endpoint based on domain
  useEffect(() => {
    if (domain && !localConfig.defaultPdsEndpoint) {
      setLocalConfig(prev => ({
        ...prev,
        defaultPdsEndpoint: `https://pds.${domain}`,
      }));
    }
  }, [domain, localConfig.defaultPdsEndpoint]);

  // Fetch identities for this domain
  const { data: identitiesData, isLoading: identitiesLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'identities', { searchQuery, statusFilter }],
    queryFn: async () => {
      // This would call the API to get domain identities
      return { identities: [] as any[], total: 0 };
    },
  });

  // Fetch handle reservations for this domain
  const { data: reservationsData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'handleReservations'],
    queryFn: async () => {
      return { reservations: [] as any[] };
    },
  });

  const identities = identitiesData?.identities || [];
  const reservations = reservationsData?.reservations || [];

  const handleSaveConfig = () => {
    onUpdate(localConfig);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'tombstoned': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'deactivated': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* PLC Configuration */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">PLC Configuration</h2>
            <p className="text-sm text-text-muted mt-0.5">
              Configure identity management for this domain
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            localConfig.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
          }`}>
            {localConfig.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium">Enable PLC</p>
              <p className="text-sm text-text-muted">Allow identity registration on this domain</p>
            </div>
            <button
              onClick={() => setLocalConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localConfig.enabled ? 'bg-accent' : 'bg-surface-hover'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                localConfig.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Mode Selection */}
          <div>
            <label className="block text-sm text-text-muted mb-2">PLC Mode</label>
            <div className="flex gap-2">
              {(['standalone', 'external'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLocalConfig(prev => ({ ...prev, mode }))}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    localConfig.mode === mode
                      ? 'bg-accent text-text-inverse'
                      : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-2">
              {localConfig.mode === 'standalone' && 'Run your own PLC directory for this domain'}
              {localConfig.mode === 'external' && 'Proxy to an external PLC directory'}
            </p>
          </div>

          {/* External PLC URL (when mode is external) */}
          {localConfig.mode === 'external' && (
            <div>
              <label className="block text-sm text-text-muted mb-1">External PLC URL</label>
              <input
                type="text"
                value={localConfig.externalPlcUrl || ''}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, externalPlcUrl: e.target.value }))}
                placeholder="https://plc.directory"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              />
            </div>
          )}

          {/* Default PDS Endpoint */}
          <div>
            <label className="block text-sm text-text-muted mb-1">Default PDS Endpoint</label>
            <input
              type="text"
              value={localConfig.defaultPdsEndpoint || ''}
              onChange={(e) => setLocalConfig(prev => ({ ...prev, defaultPdsEndpoint: e.target.value }))}
              placeholder="https://pds.example.com"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>

          {/* Handle Settings */}
          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-medium text-text-primary mb-3">Handle Settings</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-secondary text-sm">Allow Custom Handles</p>
                  <p className="text-xs text-text-muted">Let users choose their own handles</p>
                </div>
                <button
                  onClick={() => setLocalConfig(prev => ({ ...prev, allowCustomHandles: !prev.allowCustomHandles }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    localConfig.allowCustomHandles ? 'bg-accent' : 'bg-surface-hover'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    localConfig.allowCustomHandles ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-secondary text-sm">Require Invite Code</p>
                  <p className="text-xs text-text-muted">New registrations need an invite</p>
                </div>
                <button
                  onClick={() => setLocalConfig(prev => ({ ...prev, requireInviteCode: !prev.requireInviteCode }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    localConfig.requireInviteCode ? 'bg-accent' : 'bg-surface-hover'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    localConfig.requireInviteCode ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Handle Suffix Info */}
          {handleSuffix && (
            <div className="border-t border-border pt-4">
              <label className="block text-sm text-text-muted mb-1">Handle Suffix</label>
              <p className="text-text-primary font-mono">{handleSuffix}</p>
              <p className="text-xs text-text-muted mt-1">
                Users will have handles like @username{handleSuffix}
              </p>
            </div>
          )}

          {/* Organization Handle Suffixes */}
          <OrgHandleSuffixConfig
            suffixes={localConfig.orgHandleSuffixes || {}}
            onChange={(suffixes) => setLocalConfig(prev => ({ ...prev, orgHandleSuffixes: suffixes }))}
          />
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSaveConfig}
            disabled={isUpdating}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isUpdating ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Identity Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-text-primary">{identityCount}</p>
          <p className="text-sm text-text-muted">Total Identities</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-400">
            {identities.filter((i: any) => i.status === 'active').length}
          </p>
          <p className="text-sm text-text-muted">Active</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-400">
            {identities.filter((i: any) => i.status === 'tombstoned').length}
          </p>
          <p className="text-sm text-text-muted">Tombstoned</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{reservations.length}</p>
          <p className="text-sm text-text-muted">Reserved Handles</p>
        </div>
      </div>

      {/* Identities List */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Identities</h2>
          <button
            onClick={() => setShowCreateIdentity(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
          >
            Create Identity
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by DID or handle..."
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="tombstoned">Tombstoned</option>
          </select>
        </div>

        {/* Identities Table */}
        {identitiesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : identities.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <IdentityIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No identities found</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">DID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Handle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {identities.map((identity: any) => (
                  <tr key={identity.did} className="hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <p className="text-text-primary font-mono text-sm truncate max-w-[200px]">
                        {identity.did}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-text-primary">@{identity.handle}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(identity.status)}`}>
                        {identity.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted">
                      {new Date(identity.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="text-accent hover:text-accent-hover text-sm">View</button>
                        {identity.status === 'active' && (
                          <button className="text-red-400 hover:text-red-300 text-sm">Tombstone</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Handle Reservations */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Handle Reservations</h2>
          <button
            onClick={() => setShowReserveHandle(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
          >
            Reserve Handle
          </button>
        </div>

        {reservations.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <p className="text-text-muted">No reserved handles</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reservations.map((reservation: any) => (
              <div key={reservation.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                <div>
                  <p className="text-text-primary font-medium">@{reservation.handle}</p>
                  <p className="text-xs text-text-muted">
                    Reserved {new Date(reservation.reservedAt).toLocaleDateString()}
                    {reservation.expiresAt && ` · Expires ${new Date(reservation.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button className="text-red-400 hover:text-red-300 text-sm">Release</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateIdentityModal
        domainId={domainId}
        handleSuffix={handleSuffix || (domain ? `.${domain}` : '')}
        defaultPdsEndpoint={localConfig.defaultPdsEndpoint}
        isOpen={showCreateIdentity}
        onClose={() => setShowCreateIdentity(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'identities'] });
          setShowCreateIdentity(false);
        }}
      />

      <ReserveHandleModal
        domainId={domainId}
        handleSuffix={handleSuffix || (domain ? `.${domain}` : '')}
        isOpen={showReserveHandle}
        onClose={() => setShowReserveHandle(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'handleReservations'] });
          setShowReserveHandle(false);
        }}
      />
    </div>
  );
}

function IdentityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
    </svg>
  );
}

// Organization Handle Suffix Configuration Component
function OrgHandleSuffixConfig({
  suffixes,
  onChange,
}: {
  suffixes: Record<string, string>;
  onChange: (suffixes: Record<string, string>) => void;
}) {
  const orgTypes = [
    { key: 'team', label: 'Team', description: 'Small groups or teams', example: '@teamname' },
    { key: 'enterprise', label: 'Enterprise', description: 'Large organizations', example: '@corp-acme' },
    { key: 'nonprofit', label: 'Nonprofit', description: 'Charitable organizations', example: '@npo-charity' },
    { key: 'business', label: 'Business', description: 'Business accounts', example: '@biz-store' },
  ];

  const handleSuffixChange = (type: string, suffix: string) => {
    // Clean up the suffix - remove @ and spaces
    const cleanSuffix = suffix.replace(/[@\s]/g, '').toLowerCase();
    onChange({
      ...suffixes,
      [type]: cleanSuffix,
    });
  };

  return (
    <div className="border-t border-border pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Organization Handle Suffixes</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Configure prefixes/suffixes for organization handles by type
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {orgTypes.map((type) => (
          <div key={type.key} className="flex items-start gap-4 p-3 bg-surface-hover rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-text-primary font-medium text-sm">{type.label}</span>
                <span className="text-xs text-text-muted">{type.description}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-text-muted text-sm">@</span>
                <input
                  type="text"
                  value={suffixes[type.key] || ''}
                  onChange={(e) => handleSuffixChange(type.key, e.target.value)}
                  placeholder="prefix-"
                  className="flex-1 px-2 py-1 bg-background border border-border rounded text-text-primary text-sm placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
                <span className="text-text-muted text-sm">{'{name}'}</span>
              </div>
              {suffixes[type.key] && (
                <p className="text-xs text-text-muted mt-1">
                  Preview: @{suffixes[type.key]}example-org
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-xs text-blue-300">
          <strong>Note:</strong> Handle suffixes help distinguish organization types visually.
          Leave empty to use default handles without prefix. Changes apply to newly created organizations.
        </p>
      </div>
    </div>
  );
}

// Helper functions
function formatActivityAction(action: string): string {
  const actionMap: Record<string, string> = {
    domain_created: 'Domain created',
    domain_updated: 'Domain settings updated',
    domain_verified: 'Domain verified',
    user_added: 'User added to domain',
    user_removed: 'User removed from domain',
    user_role_updated: 'User role updated',
    group_created: 'Group created',
    group_deleted: 'Group deleted',
    certificate_issued: 'Certificate issued',
    certificate_revoked: 'Certificate revoked',
  };
  return actionMap[action] || action;
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

// Clusters Tab Component
function ClustersTab({ domainId }: { domainId: string }) {
  const [showAssignModal, setShowAssignModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: clustersData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'clusters'],
    queryFn: () => api.adminDomainClustersList(domainId),
  });

  const { data: availableData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'clusters', 'available'],
    queryFn: () => api.adminDomainClustersAvailable(domainId),
    enabled: showAssignModal,
  });

  const assignMutation = useMutation({
    mutationFn: (data: { clusterId: string; isPrimary?: boolean }) =>
      api.adminDomainClustersAssign({ domainId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'clusters'] });
      toast.success('Cluster assigned');
      setShowAssignModal(false);
    },
    onError: () => toast.error('Failed to assign cluster'),
  });

  const removeMutation = useMutation({
    mutationFn: (clusterId: string) =>
      api.adminDomainClustersRemove({ domainId, clusterId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'clusters'] });
      toast.success('Cluster removed');
    },
    onError: () => toast.error('Failed to remove cluster'),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: (clusterId: string) =>
      api.adminDomainClustersSetPrimary({ domainId, clusterId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'clusters'] });
      toast.success('Primary cluster updated');
    },
    onError: () => toast.error('Failed to set primary cluster'),
  });

  const clusters = clustersData?.clusters || [];
  const available = availableData?.clusters || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'inactive': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      case 'error': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Assigned Clusters */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Assigned Clusters</h2>
            <p className="text-sm text-text-muted mt-0.5">
              Render clusters available for this domain's video processing
            </p>
          </div>
          <button
            onClick={() => setShowAssignModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
          >
            Assign Cluster
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : clusters.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <ServerIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No clusters assigned</p>
            <p className="text-sm text-text-muted mt-1">
              Assign clusters to enable video rendering for this domain
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {clusters.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  item.isPrimary ? 'bg-accent/5 border-accent/30' : 'bg-surface-hover border-border'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                    <ServerIcon className="w-5 h-5 text-text-muted" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">{item.cluster.name}</span>
                      {item.isPrimary && (
                        <span className="px-2 py-0.5 rounded text-xs bg-accent/10 text-accent font-medium">
                          Primary
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(item.cluster.status)}`}>
                        {item.cluster.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-text-muted mt-1">
                      <span>{item.cluster.type}</span>
                      <span>&bull;</span>
                      <span>{item.cluster.region}</span>
                      <span>&bull;</span>
                      <span>{item.cluster.workerCount} workers</span>
                      {item.cluster.gpuEnabled && (
                        <>
                          <span>&bull;</span>
                          <span className="text-green-400">GPU</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!item.isPrimary && (
                    <button
                      onClick={() => setPrimaryMutation.mutate(item.clusterId)}
                      className="text-sm text-accent hover:text-accent-hover"
                    >
                      Set Primary
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Remove this cluster from the domain?')) {
                        removeMutation.mutate(item.clusterId);
                      }
                    }}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cluster Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-text-primary">{clusters.length}</p>
          <p className="text-sm text-text-muted">Assigned Clusters</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-400">
            {clusters.filter(c => c.cluster.status === 'active').length}
          </p>
          <p className="text-sm text-text-muted">Active</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">
            {clusters.reduce((sum, c) => sum + c.cluster.workerCount, 0)}
          </p>
          <p className="text-sm text-text-muted">Total Workers</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">
            {clusters.filter(c => c.cluster.gpuEnabled).length}
          </p>
          <p className="text-sm text-text-muted">GPU Clusters</p>
        </div>
      </div>

      {/* Assign Cluster Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAssignModal(false)} />
          <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Assign Cluster</h2>
              <p className="text-sm text-text-muted mt-1">Select a cluster to assign to this domain</p>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto">
              {available.length === 0 ? (
                <p className="text-text-muted text-center py-8">No available clusters</p>
              ) : (
                <div className="space-y-2">
                  {available.map((cluster) => (
                    <button
                      key={cluster.id}
                      onClick={() => assignMutation.mutate({ clusterId: cluster.id })}
                      disabled={assignMutation.isPending}
                      className="w-full flex items-center justify-between p-4 bg-surface-hover hover:bg-surface border border-border rounded-lg transition-colors text-left"
                    >
                      <div>
                        <p className="font-medium text-text-primary">{cluster.name}</p>
                        <p className="text-sm text-text-muted">
                          {cluster.type} &bull; {cluster.region} &bull; {cluster.workerCount} workers
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(cluster.status)}`}>
                        {cluster.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

// Platform Services Tab Component
function PlatformServicesTab({
  domainId,
  domain,
}: {
  domainId: string;
  domain: string;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'services'],
    queryFn: () => api.adminDomainServicesList(domainId),
  });

  const configureMutation = useMutation({
    mutationFn: (data: {
      serviceType: 'pds' | 'relay' | 'appview' | 'labeler';
      enabled: boolean;
      endpoint?: string;
      config?: Record<string, unknown>;
    }) => api.adminDomainServicesConfigure({ domainId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'services'] });
      toast.success('Service configuration updated');
    },
    onError: () => toast.error('Failed to update service'),
  });

  const services = data?.services || [];

  const serviceInfo: Record<string, { name: string; description: string; icon: React.ReactNode }> = {
    pds: {
      name: 'Personal Data Server',
      description: 'Host user data repositories and manage identity',
      icon: <DatabaseIcon className="w-6 h-6" />,
    },
    relay: {
      name: 'Relay',
      description: 'Federation firehose for real-time content distribution',
      icon: <RelayIcon className="w-6 h-6" />,
    },
    appview: {
      name: 'App View',
      description: 'Aggregated timeline, search, and content indexing',
      icon: <AppViewIcon className="w-6 h-6" />,
    },
    labeler: {
      name: 'Labeler',
      description: 'Content moderation and automated labeling',
      icon: <LabelIcon className="w-6 h-6" />,
    },
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500/10 text-green-400';
      case 'starting': return 'bg-yellow-500/10 text-yellow-400';
      case 'error': return 'bg-red-500/10 text-red-400';
      case 'stopped': return 'bg-gray-500/10 text-gray-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Platform Services</h2>
        <p className="text-sm text-text-muted">
          Configure AT Protocol services for this domain. Each service provides specific functionality for federation and content management.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {services.map((service) => {
          const info = serviceInfo[service.serviceType];
          return (
            <div
              key={service.serviceType}
              className="bg-surface border border-border rounded-lg p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center text-text-muted">
                    {info?.icon}
                  </div>
                  <div>
                    <h3 className="font-medium text-text-primary">{info?.name || service.serviceType}</h3>
                    <p className="text-xs text-text-muted">{info?.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => configureMutation.mutate({
                    serviceType: service.serviceType,
                    enabled: !service.enabled,
                    endpoint: service.endpoint || undefined,
                  })}
                  disabled={configureMutation.isPending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    service.enabled ? 'bg-accent' : 'bg-surface-hover'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    service.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {service.enabled && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">Status</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(service.status)}`}>
                      {service.status}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm text-text-muted mb-1">Endpoint</label>
                    <input
                      type="text"
                      defaultValue={service.endpoint || `https://${service.serviceType}.${domain}`}
                      placeholder={`https://${service.serviceType}.${domain}`}
                      onBlur={(e) => {
                        if (e.target.value !== service.endpoint) {
                          configureMutation.mutate({
                            serviceType: service.serviceType,
                            enabled: service.enabled,
                            endpoint: e.target.value,
                          });
                        }
                      }}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm"
                    />
                  </div>
                  {service.lastHealthCheck && (
                    <p className="text-xs text-text-muted">
                      Last check: {new Date(service.lastHealthCheck).toLocaleString()}
                    </p>
                  )}
                  {service.errorMessage && (
                    <p className="text-xs text-red-400">{service.errorMessage}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Service Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-text-primary">
            {services.filter(s => s.enabled).length}
          </p>
          <p className="text-sm text-text-muted">Enabled Services</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-400">
            {services.filter(s => s.status === 'running').length}
          </p>
          <p className="text-sm text-text-muted">Running</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">
            {services.filter(s => s.status === 'starting').length}
          </p>
          <p className="text-sm text-text-muted">Starting</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-400">
            {services.filter(s => s.status === 'error').length}
          </p>
          <p className="text-sm text-text-muted">Errors</p>
        </div>
      </div>
    </div>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  );
}

function RelayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function AppViewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function LabelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
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

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

// ============================================
// SSO Tab Component
// ============================================

type SSOMode = 'disabled' | 'optional' | 'required';

interface SSOConfig {
  ssoMode: SSOMode;
  primaryIdpId?: string;
  allowedIdpIds: string[];
  jitProvisioning: boolean;
  defaultOrganizationId?: string;
  defaultRole: string;
  emailDomainVerification: boolean;
  allowedEmailDomains: string[];
  forceReauthAfterHours: number;
}

interface IdentityProvider {
  id: string;
  name: string;
  type: 'oidc' | 'oauth2' | 'saml';
  providerKey: string;
  displayName: string;
  iconUrl?: string;
  buttonColor?: string;
  status: 'active' | 'inactive' | 'testing';
  domainId?: string;
  autoProvisionUsers: boolean;
  requiredEmailDomain?: string;
  priority: number;
  createdAt: string;
}

interface OAuthClient {
  id: string;
  clientId: string;
  clientName: string;
  clientUri?: string;
  logoUri?: string;
  clientType: 'confidential' | 'public';
  applicationType: 'web' | 'native' | 'spa';
  redirectUris: string[];
  grantTypes: string[];
  allowedScopes: string[];
  requireConsent: boolean;
  requirePkce: boolean;
  status: 'active' | 'suspended' | 'pending_approval';
  createdAt: string;
}

interface SAMLServiceProvider {
  id: string;
  entityId: string;
  name: string;
  description?: string;
  assertionConsumerServiceUrl: string;
  singleLogoutServiceUrl?: string;
  nameIdFormat: string;
  signAssertions: boolean;
  signResponse: boolean;
  encryptAssertions: boolean;
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
}

interface SSOAuditLog {
  id: string;
  eventType: string;
  userDid?: string;
  clientId?: string;
  providerId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  createdAt: string;
}

function SSOTab({ domainId, domainName }: { domainId: string; domainName: string }) {
  const [activeSection, setActiveSection] = useState<'config' | 'providers' | 'clients' | 'saml' | 'audit'>('config');
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showAddSAMLModal, setShowAddSAMLModal] = useState(false);
  const [showAddEmailDomainModal, setShowAddEmailDomainModal] = useState(false);
  const queryClient = useQueryClient();

  // Fetch SSO configuration
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'config'],
    queryFn: () => api.adminDomainSSOConfigGet(domainId),
  });

  // Fetch identity providers
  const { data: providersData, isLoading: providersLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers'],
    queryFn: () => api.adminDomainSSOProvidersList(domainId),
  });

  // Fetch OAuth clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'clients'],
    queryFn: () => api.adminDomainOAuthClientsList(domainId),
  });

  // Fetch SAML service providers
  const { data: samlData, isLoading: samlLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'saml'],
    queryFn: () => api.adminDomainSAMLProvidersList(domainId),
  });

  // Fetch audit log
  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'audit'],
    queryFn: () => api.adminDomainSSOAuditLog(domainId, { limit: 50 }),
    enabled: activeSection === 'audit',
  });

  // Update SSO config mutation
  const updateConfigMutation = useMutation({
    mutationFn: (config: Partial<SSOConfig>) =>
      api.adminDomainSSOConfigUpdate(domainId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'config'] });
      toast.success('SSO configuration updated');
    },
    onError: () => toast.error('Failed to update SSO configuration'),
  });

  // Add provider mutation
  const addProviderMutation = useMutation({
    mutationFn: (data: { providerId: string; setPrimary?: boolean }) =>
      api.adminDomainSSOProvidersAdd(domainId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
      toast.success('Provider added');
      setShowAddProviderModal(false);
    },
    onError: () => toast.error('Failed to add provider'),
  });

  // Remove provider mutation
  const removeProviderMutation = useMutation({
    mutationFn: (providerId: string) =>
      api.adminDomainSSOProvidersRemove(domainId, providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
      toast.success('Provider removed');
    },
    onError: () => toast.error('Failed to remove provider'),
  });

  // Set primary provider mutation
  const setPrimaryMutation = useMutation({
    mutationFn: (providerId: string) =>
      api.adminDomainSSOProvidersSetPrimary(domainId, providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'config'] });
      toast.success('Primary provider updated');
    },
    onError: () => toast.error('Failed to set primary provider'),
  });

  // OAuth client mutations
  const createClientMutation = useMutation({
    mutationFn: (data: {
      clientName: string;
      clientUri?: string;
      applicationType?: 'web' | 'native' | 'spa';
      redirectUris: string[];
      allowedScopes?: string[];
      requireConsent?: boolean;
      requirePkce?: boolean;
    }) => api.adminDomainOAuthClientsCreate(domainId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'clients'] });
      toast.success('OAuth client created');
      setShowAddClientModal(false);
    },
    onError: () => toast.error('Failed to create OAuth client'),
  });

  const deleteClientMutation = useMutation({
    mutationFn: (clientId: string) =>
      api.adminDomainOAuthClientsDelete(domainId, clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'clients'] });
      toast.success('OAuth client deleted');
    },
    onError: () => toast.error('Failed to delete OAuth client'),
  });

  // SAML mutations
  const createSAMLMutation = useMutation({
    mutationFn: (data: {
      name: string;
      entityId: string;
      assertionConsumerServiceUrl: string;
      singleLogoutServiceUrl?: string;
      nameIdFormat?: string;
      signAssertions?: boolean;
      signResponse?: boolean;
      encryptAssertions?: boolean;
    }) => api.adminDomainSAMLProvidersCreate(domainId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'saml'] });
      toast.success('SAML service provider created');
      setShowAddSAMLModal(false);
    },
    onError: () => toast.error('Failed to create SAML service provider'),
  });

  const deleteSAMLMutation = useMutation({
    mutationFn: (spId: string) =>
      api.adminDomainSAMLProvidersDelete(domainId, spId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'saml'] });
      toast.success('SAML service provider deleted');
    },
    onError: () => toast.error('Failed to delete SAML service provider'),
  });

  // Email domain mutations
  const addEmailDomainMutation = useMutation({
    mutationFn: (emailDomain: string) =>
      api.adminDomainSSOEmailDomainsAdd(domainId, { emailDomain }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'config'] });
      toast.success('Email domain added');
      setShowAddEmailDomainModal(false);
    },
    onError: () => toast.error('Failed to add email domain'),
  });

  const removeEmailDomainMutation = useMutation({
    mutationFn: (emailDomain: string) =>
      api.adminDomainSSOEmailDomainsRemove(domainId, emailDomain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'config'] });
      toast.success('Email domain removed');
    },
    onError: () => toast.error('Failed to remove email domain'),
  });

  const config = configData?.config || {
    ssoMode: 'disabled' as SSOMode,
    allowedIdpIds: [],
    jitProvisioning: true,
    defaultRole: 'member',
    emailDomainVerification: true,
    allowedEmailDomains: [],
    forceReauthAfterHours: 24,
  };

  const providers = providersData?.providers || [];
  const clients = clientsData?.clients || [];
  const samlProviders = samlData?.providers || [];
  const auditLogs = auditData?.logs || [];

  const sections = [
    { id: 'config', label: 'Configuration', icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'providers', label: 'Identity Providers', icon: <KeyIcon className="w-4 h-4" /> },
    { id: 'clients', label: 'OAuth Clients', icon: <AppIcon className="w-4 h-4" /> },
    { id: 'saml', label: 'SAML Service Providers', icon: <SamlIcon className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Log', icon: <LogIcon className="w-4 h-4" /> },
  ] as const;

  const getModeColor = (mode: SSOMode) => {
    switch (mode) {
      case 'disabled': return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
      case 'optional': return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'required': return 'bg-green-500/10 text-green-400 border-green-500/30';
    }
  };

  const getProviderTypeColor = (type: string) => {
    switch (type) {
      case 'oidc': return 'bg-purple-500/10 text-purple-400';
      case 'oauth2': return 'bg-blue-500/10 text-blue-400';
      case 'saml': return 'bg-orange-500/10 text-orange-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'inactive':
      case 'suspended': return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'testing':
      case 'pending':
      case 'pending_approval': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2 flex-wrap">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === section.id
                ? 'bg-accent text-text-inverse'
                : 'bg-surface-hover text-text-secondary hover:text-text-primary'
            }`}
          >
            {section.icon}
            {section.label}
          </button>
        ))}
      </div>

      {/* Configuration Section */}
      {activeSection === 'config' && (
        <SSOConfigSection
          config={config}
          providers={providers}
          isLoading={configLoading}
          onUpdate={(updates) => updateConfigMutation.mutate(updates)}
          onSetPrimary={(providerId) => setPrimaryMutation.mutate(providerId)}
          onAddEmailDomain={() => setShowAddEmailDomainModal(true)}
          onRemoveEmailDomain={(domain) => removeEmailDomainMutation.mutate(domain)}
          isUpdating={updateConfigMutation.isPending}
        />
      )}

      {/* Identity Providers Section */}
      {activeSection === 'providers' && (
        <IdentityProvidersSection
          providers={providers}
          config={config}
          isLoading={providersLoading}
          onAdd={() => setShowAddProviderModal(true)}
          onRemove={(id) => {
            if (confirm('Remove this identity provider from the domain?')) {
              removeProviderMutation.mutate(id);
            }
          }}
          onSetPrimary={(id) => setPrimaryMutation.mutate(id)}
          getProviderTypeColor={getProviderTypeColor}
          getStatusColor={getStatusColor}
        />
      )}

      {/* OAuth Clients Section */}
      {activeSection === 'clients' && (
        <OAuthClientsSection
          clients={clients}
          domainName={domainName}
          isLoading={clientsLoading}
          onAdd={() => setShowAddClientModal(true)}
          onDelete={(id) => {
            if (confirm('Delete this OAuth client? This cannot be undone.')) {
              deleteClientMutation.mutate(id);
            }
          }}
          getStatusColor={getStatusColor}
        />
      )}

      {/* SAML Service Providers Section */}
      {activeSection === 'saml' && (
        <SAMLProvidersSection
          providers={samlProviders}
          domainName={domainName}
          isLoading={samlLoading}
          onAdd={() => setShowAddSAMLModal(true)}
          onDelete={(id) => {
            if (confirm('Delete this SAML service provider? This cannot be undone.')) {
              deleteSAMLMutation.mutate(id);
            }
          }}
          getStatusColor={getStatusColor}
        />
      )}

      {/* Audit Log Section */}
      {activeSection === 'audit' && (
        <SSOAuditLogSection
          logs={auditLogs}
          isLoading={auditLoading}
        />
      )}

      {/* Modals */}
      {showAddProviderModal && (
        <AddIdentityProviderModal
          domainId={domainId}
          existingProviderIds={config.allowedIdpIds}
          onAdd={(providerId, setPrimary) => addProviderMutation.mutate({ providerId, setPrimary })}
          onClose={() => setShowAddProviderModal(false)}
          isAdding={addProviderMutation.isPending}
        />
      )}

      {showAddClientModal && (
        <AddOAuthClientModal
          domainId={domainId}
          domainName={domainName}
          onAdd={(data) => createClientMutation.mutate(data)}
          onClose={() => setShowAddClientModal(false)}
          isAdding={createClientMutation.isPending}
        />
      )}

      {showAddSAMLModal && (
        <AddSAMLProviderModal
          domainId={domainId}
          domainName={domainName}
          onAdd={(data) => createSAMLMutation.mutate(data)}
          onClose={() => setShowAddSAMLModal(false)}
          isAdding={createSAMLMutation.isPending}
        />
      )}

      {showAddEmailDomainModal && (
        <AddEmailDomainModal
          domainId={domainId}
          existingDomains={config.allowedEmailDomains}
          onAdd={(domain) => addEmailDomainMutation.mutate(domain)}
          onClose={() => setShowAddEmailDomainModal(false)}
          isAdding={addEmailDomainMutation.isPending}
        />
      )}
    </div>
  );
}

// SSO Configuration Section
function SSOConfigSection({
  config,
  providers,
  isLoading,
  onUpdate,
  onSetPrimary,
  onAddEmailDomain,
  onRemoveEmailDomain,
  isUpdating,
}: {
  config: SSOConfig;
  providers: IdentityProvider[];
  isLoading: boolean;
  onUpdate: (updates: Partial<SSOConfig>) => void;
  onSetPrimary: (providerId: string) => void;
  onAddEmailDomain: () => void;
  onRemoveEmailDomain: (domain: string) => void;
  isUpdating: boolean;
}) {
  const [localConfig, setLocalConfig] = useState(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSave = () => {
    onUpdate(localConfig);
  };

  const getModeDescription = (mode: SSOMode) => {
    switch (mode) {
      case 'disabled': return 'SSO is completely disabled. Users must use local authentication.';
      case 'optional': return 'Users can choose between SSO and local authentication.';
      case 'required': return 'Users must authenticate via SSO. Local authentication is disabled.';
    }
  };

  return (
    <div className="space-y-6">
      {/* SSO Mode */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">SSO Mode</h3>
        <div className="space-y-3">
          {(['disabled', 'optional', 'required'] as SSOMode[]).map((mode) => (
            <label
              key={mode}
              className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                localConfig.ssoMode === mode
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-accent/50'
              }`}
            >
              <input
                type="radio"
                name="ssoMode"
                value={mode}
                checked={localConfig.ssoMode === mode}
                onChange={() => setLocalConfig((prev) => ({ ...prev, ssoMode: mode }))}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="font-medium text-text-primary capitalize">{mode}</p>
                <p className="text-sm text-text-muted mt-1">{getModeDescription(mode)}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Primary Identity Provider (only shown when SSO is required) */}
      {localConfig.ssoMode === 'required' && (
        <div className="bg-surface border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Primary Identity Provider</h3>
          <p className="text-sm text-text-muted mb-4">
            When SSO is required, users will be automatically redirected to this provider for authentication.
          </p>
          {providers.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <p className="text-text-muted">No identity providers configured</p>
              <p className="text-sm text-text-muted mt-1">Add an identity provider first</p>
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((provider) => (
                <label
                  key={provider.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                    config.primaryIdpId === provider.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="primaryIdp"
                    checked={config.primaryIdpId === provider.id}
                    onChange={() => onSetPrimary(provider.id)}
                  />
                  <div className="flex items-center gap-3 flex-1">
                    {provider.iconUrl ? (
                      <img src={provider.iconUrl} alt="" className="w-8 h-8 rounded" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-surface-hover flex items-center justify-center">
                        <KeyIcon className="w-4 h-4 text-text-muted" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-text-primary">{provider.displayName}</p>
                      <p className="text-xs text-text-muted uppercase">{provider.type}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* JIT Provisioning */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Just-In-Time Provisioning</h3>
            <p className="text-sm text-text-muted mt-1">
              Automatically create user accounts when they authenticate via SSO
            </p>
          </div>
          <button
            onClick={() => setLocalConfig((prev) => ({ ...prev, jitProvisioning: !prev.jitProvisioning }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              localConfig.jitProvisioning ? 'bg-accent' : 'bg-surface-hover'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              localConfig.jitProvisioning ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {localConfig.jitProvisioning && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div>
              <label className="block text-sm text-text-muted mb-1">Default Role for New Users</label>
              <select
                value={localConfig.defaultRole}
                onChange={(e) => setLocalConfig((prev) => ({ ...prev, defaultRole: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              >
                <option value="member">Member</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Email Domain Restrictions */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Email Domain Verification</h3>
            <p className="text-sm text-text-muted mt-1">
              Restrict SSO authentication to specific email domains
            </p>
          </div>
          <button
            onClick={() =>
              setLocalConfig((prev) => ({ ...prev, emailDomainVerification: !prev.emailDomainVerification }))
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              localConfig.emailDomainVerification ? 'bg-accent' : 'bg-surface-hover'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              localConfig.emailDomainVerification ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {localConfig.emailDomainVerification && (
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-text-muted">Allowed Email Domains</label>
              <button
                onClick={onAddEmailDomain}
                className="text-sm text-accent hover:text-accent-hover"
              >
                Add Domain
              </button>
            </div>
            {config.allowedEmailDomains.length === 0 ? (
              <p className="text-sm text-text-muted italic">No domains configured (all domains allowed)</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {config.allowedEmailDomains.map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-2 px-3 py-1 bg-surface-hover rounded-full text-sm"
                  >
                    <span className="text-text-primary">{domain}</span>
                    <button
                      onClick={() => onRemoveEmailDomain(domain)}
                      className="text-text-muted hover:text-red-400"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Session Settings */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Session Settings</h3>
        <div>
          <label className="block text-sm text-text-muted mb-1">Force Re-authentication After (hours)</label>
          <input
            type="number"
            value={localConfig.forceReauthAfterHours}
            onChange={(e) =>
              setLocalConfig((prev) => ({ ...prev, forceReauthAfterHours: parseInt(e.target.value) || 24 }))
            }
            min={1}
            max={720}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
          />
          <p className="text-xs text-text-muted mt-1">
            Users will be required to re-authenticate after this period of inactivity
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isUpdating}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {isUpdating ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}

// Identity Providers Section
function IdentityProvidersSection({
  providers,
  config,
  isLoading,
  onAdd,
  onRemove,
  onSetPrimary,
  getProviderTypeColor,
  getStatusColor,
}: {
  providers: IdentityProvider[];
  config: SSOConfig;
  isLoading: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSetPrimary: (id: string) => void;
  getProviderTypeColor: (type: string) => string;
  getStatusColor: (status: string) => string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">External Identity Providers</h3>
            <p className="text-sm text-text-muted mt-1">
              Configure external identity providers (Google, Microsoft, Okta, etc.) for SSO authentication
            </p>
          </div>
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
          >
            Add Provider
          </button>
        </div>

        {providers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <KeyIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No identity providers configured</p>
            <p className="text-sm text-text-muted mt-1">
              Add external identity providers to enable SSO for this domain
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  config.primaryIdpId === provider.id ? 'bg-accent/5 border-accent/30' : 'bg-surface-hover border-border'
                }`}
              >
                <div className="flex items-center gap-4">
                  {provider.iconUrl ? (
                    <img src={provider.iconUrl} alt="" className="w-10 h-10 rounded-lg" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: provider.buttonColor || '#6366f1' }}
                    >
                      <KeyIcon className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">{provider.displayName}</span>
                      {config.primaryIdpId === provider.id && (
                        <span className="px-2 py-0.5 rounded text-xs bg-accent/10 text-accent font-medium">
                          Primary
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getProviderTypeColor(provider.type)}`}>
                        {provider.type.toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(provider.status)}`}>
                        {provider.status}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted mt-1">
                      {provider.providerKey}
                      {provider.requiredEmailDomain && ` · @${provider.requiredEmailDomain}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {config.primaryIdpId !== provider.id && (
                    <button
                      onClick={() => onSetPrimary(provider.id)}
                      className="text-sm text-accent hover:text-accent-hover"
                    >
                      Set Primary
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(provider.id)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provider Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-text-primary">{providers.length}</p>
          <p className="text-sm text-text-muted">Total Providers</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">
            {providers.filter((p) => p.type === 'oidc').length}
          </p>
          <p className="text-sm text-text-muted">OIDC</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">
            {providers.filter((p) => p.type === 'oauth2').length}
          </p>
          <p className="text-sm text-text-muted">OAuth2</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">
            {providers.filter((p) => p.type === 'saml').length}
          </p>
          <p className="text-sm text-text-muted">SAML</p>
        </div>
      </div>
    </div>
  );
}

// OAuth Clients Section
function OAuthClientsSection({
  clients,
  domainName,
  isLoading,
  onAdd,
  onDelete,
  getStatusColor,
}: {
  clients: OAuthClient[];
  domainName: string;
  isLoading: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  getStatusColor: (status: string) => string;
}) {
  const [selectedClient, setSelectedClient] = useState<OAuthClient | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">OAuth 2.0 / OIDC Clients</h3>
            <p className="text-sm text-text-muted mt-1">
              Applications that use this domain for user authentication
            </p>
          </div>
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
          >
            Register Client
          </button>
        </div>

        {/* OIDC Discovery Endpoints */}
        <div className="mb-6 p-4 bg-surface-hover rounded-lg">
          <h4 className="text-sm font-medium text-text-primary mb-3">OIDC Discovery Endpoints</h4>
          <div className="space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Issuer:</span>
              <span className="text-text-secondary">https://{domainName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Discovery:</span>
              <span className="text-text-secondary">https://{domainName}/.well-known/openid-configuration</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">JWKS:</span>
              <span className="text-text-secondary">https://{domainName}/oauth/jwks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Authorize:</span>
              <span className="text-text-secondary">https://{domainName}/oauth/authorize</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Token:</span>
              <span className="text-text-secondary">https://{domainName}/oauth/token</span>
            </div>
          </div>
        </div>

        {clients.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <AppIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No OAuth clients registered</p>
            <p className="text-sm text-text-muted mt-1">
              Register applications that will use this domain for authentication
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Scopes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {client.logoUri ? (
                          <img src={client.logoUri} alt="" className="w-8 h-8 rounded" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-surface-hover flex items-center justify-center">
                            <AppIcon className="w-4 h-4 text-text-muted" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-text-primary">{client.clientName}</p>
                          <p className="text-xs text-text-muted font-mono">{client.clientId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-text-secondary capitalize">
                        {client.applicationType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {client.allowedScopes.slice(0, 3).map((scope) => (
                          <span key={scope} className="px-1.5 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                            {scope}
                          </span>
                        ))}
                        {client.allowedScopes.length > 3 && (
                          <span className="px-1.5 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                            +{client.allowedScopes.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(client.status)}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedClient(client)}
                          className="text-accent hover:text-accent-hover text-sm"
                        >
                          View
                        </button>
                        <button
                          onClick={() => onDelete(client.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client Details Modal */}
      {selectedClient && (
        <OAuthClientDetailsModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
}

// SAML Service Providers Section
function SAMLProvidersSection({
  providers,
  domainName,
  isLoading,
  onAdd,
  onDelete,
  getStatusColor,
}: {
  providers: SAMLServiceProvider[];
  domainName: string;
  isLoading: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  getStatusColor: (status: string) => string;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">SAML 2.0 Service Providers</h3>
            <p className="text-sm text-text-muted mt-1">
              Applications that use SAML for single sign-on with this domain as the Identity Provider
            </p>
          </div>
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm"
          >
            Add Service Provider
          </button>
        </div>

        {/* SAML IdP Metadata */}
        <div className="mb-6 p-4 bg-surface-hover rounded-lg">
          <h4 className="text-sm font-medium text-text-primary mb-3">Identity Provider Metadata</h4>
          <div className="space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted">Entity ID:</span>
              <span className="text-text-secondary">https://{domainName}/saml/metadata</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">SSO URL:</span>
              <span className="text-text-secondary">https://{domainName}/saml/sso</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">SLO URL:</span>
              <span className="text-text-secondary">https://{domainName}/saml/slo</span>
            </div>
          </div>
          <button className="mt-3 text-sm text-accent hover:text-accent-hover">
            Download Metadata XML
          </button>
        </div>

        {providers.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <SamlIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No SAML service providers configured</p>
            <p className="text-sm text-text-muted mt-1">
              Add service providers that will use SAML SSO with this domain
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center justify-between p-4 rounded-lg bg-surface-hover border border-border"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{sp.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(sp.status)}`}>
                      {sp.status}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted mt-1 font-mono truncate max-w-md">
                    {sp.entityId}
                  </p>
                  <div className="flex gap-4 mt-2 text-xs text-text-muted">
                    <span>Sign Assertions: {sp.signAssertions ? 'Yes' : 'No'}</span>
                    <span>Encrypt: {sp.encryptAssertions ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-sm text-accent hover:text-accent-hover">Configure</button>
                  <button
                    onClick={() => onDelete(sp.id)}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// SSO Audit Log Section
function SSOAuditLogSection({
  logs,
  isLoading,
}: {
  logs: SSOAuditLog[];
  isLoading: boolean;
}) {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const eventTypes = ['all', 'login', 'logout', 'link', 'unlink', 'consent_grant', 'consent_revoke', 'token_issue', 'token_revoke'];

  const filteredLogs = eventTypeFilter === 'all'
    ? logs
    : logs.filter((log) => log.eventType === eventTypeFilter);

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'login': return 'bg-green-500/10 text-green-400';
      case 'logout': return 'bg-blue-500/10 text-blue-400';
      case 'link':
      case 'consent_grant':
      case 'token_issue': return 'bg-purple-500/10 text-purple-400';
      case 'unlink':
      case 'consent_revoke':
      case 'token_revoke': return 'bg-orange-500/10 text-orange-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">SSO Audit Log</h3>
            <p className="text-sm text-text-muted mt-1">
              Track all SSO-related events for this domain
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {eventTypes.map((type) => (
            <button
              key={type}
              onClick={() => setEventTypeFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                eventTypeFilter === type
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {type === 'all' ? 'All Events' : type.replace('_', ' ')}
            </button>
          ))}
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <LogIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No audit log entries found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`flex items-start gap-4 p-4 rounded-lg border ${
                  log.success ? 'bg-surface-hover border-border' : 'bg-red-500/5 border-red-500/20'
                }`}
              >
                <div className={`mt-1 w-2 h-2 rounded-full ${log.success ? 'bg-green-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEventTypeColor(log.eventType)}`}>
                      {log.eventType.replace('_', ' ')}
                    </span>
                    {log.userDid && (
                      <span className="text-sm text-text-secondary truncate max-w-[200px]">
                        {log.userDid}
                      </span>
                    )}
                  </div>
                  {log.errorMessage && (
                    <p className="text-sm text-red-400 mt-1">{log.errorMessage}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                    {log.ipAddress && <span>{log.ipAddress}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Modal Components
// ============================================

function AddIdentityProviderModal({
  domainId,
  existingProviderIds,
  onAdd,
  onClose,
  isAdding,
}: {
  domainId: string;
  existingProviderIds: string[];
  onAdd: (providerId: string, setPrimary: boolean) => void;
  onClose: () => void;
  isAdding: boolean;
}) {
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [setPrimary, setSetPrimary] = useState(false);

  // Fetch available providers
  const { data: availableData, isLoading } = useQuery({
    queryKey: ['admin', 'sso', 'providers', 'available'],
    queryFn: () => api.adminSSOProvidersAvailable(),
  });

  const availableProviders = (availableData?.providers || []).filter(
    (p: IdentityProvider) => !existingProviderIds.includes(p.id)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProvider) {
      onAdd(selectedProvider, setPrimary);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Add Identity Provider</h2>
          <p className="text-sm text-text-muted mt-1">
            Select an external identity provider to enable for this domain
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : availableProviders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-text-muted">No available providers</p>
                <p className="text-sm text-text-muted mt-1">
                  All providers are already configured or no global providers exist
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableProviders.map((provider: IdentityProvider) => (
                  <label
                    key={provider.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedProvider === provider.id
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-accent/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={provider.id}
                      checked={selectedProvider === provider.id}
                      onChange={() => setSelectedProvider(provider.id)}
                    />
                    <div className="flex items-center gap-3 flex-1">
                      {provider.iconUrl ? (
                        <img src={provider.iconUrl} alt="" className="w-8 h-8 rounded" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center"
                          style={{ backgroundColor: provider.buttonColor || '#6366f1' }}
                        >
                          <KeyIcon className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-text-primary">{provider.displayName}</p>
                        <p className="text-xs text-text-muted uppercase">{provider.type}</p>
                      </div>
                    </div>
                  </label>
                ))}

                {selectedProvider && (
                  <label className="flex items-center gap-3 p-4 mt-4 rounded-lg border border-border">
                    <input
                      type="checkbox"
                      checked={setPrimary}
                      onChange={(e) => setSetPrimary(e.target.checked)}
                    />
                    <span className="text-sm text-text-secondary">Set as primary provider</span>
                  </label>
                )}
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedProvider || isAdding}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {isAdding ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddOAuthClientModal({
  domainId,
  domainName,
  onAdd,
  onClose,
  isAdding,
}: {
  domainId: string;
  domainName: string;
  onAdd: (data: {
    clientName: string;
    clientUri?: string;
    applicationType?: 'web' | 'native' | 'spa';
    redirectUris: string[];
    allowedScopes?: string[];
    requireConsent?: boolean;
    requirePkce?: boolean;
  }) => void;
  onClose: () => void;
  isAdding: boolean;
}) {
  const [formData, setFormData] = useState({
    clientName: '',
    clientUri: '',
    applicationType: 'web' as 'web' | 'native' | 'spa',
    redirectUris: [''],
    allowedScopes: ['openid', 'profile', 'email'],
    requireConsent: true,
    requirePkce: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      ...formData,
      redirectUris: formData.redirectUris.filter((uri) => uri.trim()),
    });
  };

  const addRedirectUri = () => {
    setFormData((prev) => ({
      ...prev,
      redirectUris: [...prev.redirectUris, ''],
    }));
  };

  const updateRedirectUri = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      redirectUris: prev.redirectUris.map((uri, i) => (i === index ? value : uri)),
    }));
  };

  const removeRedirectUri = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      redirectUris: prev.redirectUris.filter((_, i) => i !== index),
    }));
  };

  const toggleScope = (scope: string) => {
    setFormData((prev) => ({
      ...prev,
      allowedScopes: prev.allowedScopes.includes(scope)
        ? prev.allowedScopes.filter((s) => s !== scope)
        : [...prev.allowedScopes, scope],
    }));
  };

  const availableScopes = ['openid', 'profile', 'email', 'offline_access', 'videos:read', 'videos:write', 'follows:read', 'follows:write'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Register OAuth Client</h2>
          <p className="text-sm text-text-muted mt-1">
            Register an application that will use this domain for authentication
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Client Name *</label>
                <input
                  type="text"
                  value={formData.clientName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, clientName: e.target.value }))}
                  placeholder="My Application"
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Client Website</label>
                <input
                  type="url"
                  value={formData.clientUri}
                  onChange={(e) => setFormData((prev) => ({ ...prev, clientUri: e.target.value }))}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                />
              </div>
            </div>

            {/* Application Type */}
            <div>
              <label className="block text-sm text-text-muted mb-2">Application Type</label>
              <div className="flex gap-2">
                {(['web', 'spa', 'native'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, applicationType: type }))}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                      formData.applicationType === type
                        ? 'bg-accent text-text-inverse'
                        : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {type === 'web' ? 'Web Server' : type === 'spa' ? 'Single Page App' : 'Native/Mobile'}
                  </button>
                ))}
              </div>
            </div>

            {/* Redirect URIs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-text-muted">Redirect URIs *</label>
                <button
                  type="button"
                  onClick={addRedirectUri}
                  className="text-sm text-accent hover:text-accent-hover"
                >
                  Add URI
                </button>
              </div>
              <div className="space-y-2">
                {formData.redirectUris.map((uri, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="url"
                      value={uri}
                      onChange={(e) => updateRedirectUri(index, e.target.value)}
                      placeholder="https://example.com/callback"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                    />
                    {formData.redirectUris.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRedirectUri(index)}
                        className="px-3 py-2 text-red-400 hover:text-red-300"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Scopes */}
            <div>
              <label className="block text-sm text-text-muted mb-2">Allowed Scopes</label>
              <div className="flex flex-wrap gap-2">
                {availableScopes.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      formData.allowedScopes.includes(scope)
                        ? 'bg-accent text-text-inverse'
                        : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>

            {/* Security Options */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <input
                  type="checkbox"
                  checked={formData.requireConsent}
                  onChange={(e) => setFormData((prev) => ({ ...prev, requireConsent: e.target.checked }))}
                />
                <div>
                  <span className="text-sm text-text-primary">Require User Consent</span>
                  <p className="text-xs text-text-muted">User must approve access before authorization</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <input
                  type="checkbox"
                  checked={formData.requirePkce}
                  onChange={(e) => setFormData((prev) => ({ ...prev, requirePkce: e.target.checked }))}
                />
                <div>
                  <span className="text-sm text-text-primary">Require PKCE</span>
                  <p className="text-xs text-text-muted">Proof Key for Code Exchange (recommended for all clients)</p>
                </div>
              </label>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.clientName || !formData.redirectUris.some((u) => u.trim()) || isAdding}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {isAdding ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddSAMLProviderModal({
  domainId,
  domainName,
  onAdd,
  onClose,
  isAdding,
}: {
  domainId: string;
  domainName: string;
  onAdd: (data: {
    name: string;
    entityId: string;
    assertionConsumerServiceUrl: string;
    singleLogoutServiceUrl?: string;
    nameIdFormat?: string;
    signAssertions?: boolean;
    signResponse?: boolean;
    encryptAssertions?: boolean;
  }) => void;
  onClose: () => void;
  isAdding: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    entityId: '',
    assertionConsumerServiceUrl: '',
    singleLogoutServiceUrl: '',
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    signAssertions: true,
    signResponse: true,
    encryptAssertions: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(formData);
  };

  const nameIdFormats = [
    { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', label: 'Email Address' },
    { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', label: 'Persistent' },
    { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient', label: 'Transient' },
    { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified', label: 'Unspecified' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Add SAML Service Provider</h2>
          <p className="text-sm text-text-muted mt-1">
            Configure an application to use SAML SSO with this domain as the Identity Provider
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Service Provider Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="My SAML Application"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Entity ID (Issuer) *</label>
              <input
                type="text"
                value={formData.entityId}
                onChange={(e) => setFormData((prev) => ({ ...prev, entityId: e.target.value }))}
                placeholder="https://app.example.com/saml/metadata"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Assertion Consumer Service URL *</label>
              <input
                type="url"
                value={formData.assertionConsumerServiceUrl}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, assertionConsumerServiceUrl: e.target.value }))
                }
                placeholder="https://app.example.com/saml/acs"
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Single Logout Service URL</label>
              <input
                type="url"
                value={formData.singleLogoutServiceUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, singleLogoutServiceUrl: e.target.value }))}
                placeholder="https://app.example.com/saml/slo"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">NameID Format</label>
              <select
                value={formData.nameIdFormat}
                onChange={(e) => setFormData((prev) => ({ ...prev, nameIdFormat: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
              >
                {nameIdFormats.map((format) => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Signing & Encryption */}
            <div className="space-y-3 pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-text-primary">Security Options</h4>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.signAssertions}
                  onChange={(e) => setFormData((prev) => ({ ...prev, signAssertions: e.target.checked }))}
                />
                <span className="text-sm text-text-secondary">Sign SAML Assertions</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.signResponse}
                  onChange={(e) => setFormData((prev) => ({ ...prev, signResponse: e.target.checked }))}
                />
                <span className="text-sm text-text-secondary">Sign SAML Response</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.encryptAssertions}
                  onChange={(e) => setFormData((prev) => ({ ...prev, encryptAssertions: e.target.checked }))}
                />
                <span className="text-sm text-text-secondary">Encrypt SAML Assertions</span>
              </label>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !formData.name || !formData.entityId || !formData.assertionConsumerServiceUrl || isAdding
              }
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {isAdding ? 'Creating...' : 'Create Service Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddEmailDomainModal({
  domainId,
  existingDomains,
  onAdd,
  onClose,
  isAdding,
}: {
  domainId: string;
  existingDomains: string[];
  onAdd: (domain: string) => void;
  onClose: () => void;
  isAdding: boolean;
}) {
  const [emailDomain, setEmailDomain] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailDomain && !existingDomains.includes(emailDomain)) {
      onAdd(emailDomain);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Add Allowed Email Domain</h2>
          <p className="text-sm text-text-muted mt-1">
            Only users with email addresses from allowed domains can authenticate via SSO
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label className="block text-sm text-text-muted mb-1">Email Domain</label>
            <input
              type="text"
              value={emailDomain}
              onChange={(e) => setEmailDomain(e.target.value.toLowerCase().trim())}
              placeholder="company.com"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
            />
            <p className="text-xs text-text-muted mt-2">
              Enter the domain without @ (e.g., "company.com" for emails like user@company.com)
            </p>
          </div>
          <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!emailDomain || existingDomains.includes(emailDomain) || isAdding}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {isAdding ? 'Adding...' : 'Add Domain'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OAuthClientDetailsModal({
  client,
  onClose,
}: {
  client: OAuthClient;
  onClose: () => void;
}) {
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{client.clientName}</h2>
            <p className="text-sm text-text-muted mt-1">OAuth Client Details</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Credentials */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-primary">Credentials</h3>
            <div className="space-y-3 p-4 bg-surface-hover rounded-lg">
              <div>
                <label className="block text-xs text-text-muted mb-1">Client ID</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-background border border-border rounded text-text-primary text-sm font-mono">
                    {client.clientId}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(client.clientId)}
                    className="px-3 py-2 text-accent hover:text-accent-hover"
                  >
                    Copy
                  </button>
                </div>
              </div>
              {client.clientType === 'confidential' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Client Secret</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-background border border-border rounded text-text-primary text-sm font-mono">
                      {showSecret ? '••••••••••••••••••••••••' : '••••••••••••••••••••••••'}
                    </code>
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="px-3 py-2 text-text-muted hover:text-text-primary"
                    >
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <p className="text-xs text-yellow-400 mt-2">
                    The client secret is only shown once when the client is created.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-primary">Configuration</h3>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-text-muted">Application Type</dt>
                <dd className="text-text-primary capitalize">{client.applicationType}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Client Type</dt>
                <dd className="text-text-primary capitalize">{client.clientType}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Require Consent</dt>
                <dd className="text-text-primary">{client.requireConsent ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Require PKCE</dt>
                <dd className="text-text-primary">{client.requirePkce ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </div>

          {/* Redirect URIs */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-primary">Redirect URIs</h3>
            <div className="space-y-2">
              {client.redirectUris.map((uri, index) => (
                <code
                  key={index}
                  className="block px-3 py-2 bg-surface-hover border border-border rounded text-text-secondary text-sm font-mono break-all"
                >
                  {uri}
                </code>
              ))}
            </div>
          </div>

          {/* Scopes */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-text-primary">Allowed Scopes</h3>
            <div className="flex flex-wrap gap-2">
              {client.allowedScopes.map((scope) => (
                <span
                  key={scope}
                  className="px-3 py-1 bg-surface-hover rounded-full text-sm text-text-secondary"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SSO Tab Icons
// ============================================

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.93l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.93l.15-.894z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function AppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function SamlIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" />
    </svg>
  );
}

function LogIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
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
