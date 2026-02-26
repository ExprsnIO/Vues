'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Tab = 'overview' | 'users' | 'groups' | 'services' | 'identity' | 'certificates' | 'federation' | 'branding';

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
    { id: 'certificates', label: 'Certificates' },
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
            plcConfig={domain.plcConfig}
            identityCount={domain.identityCount || 0}
            handleSuffix={domain.handleSuffix}
            onUpdate={(plcConfig) => updateMutation.mutate({ id, plcConfig })}
            isUpdating={updateMutation.isPending}
          />
        )}
        {activeTab === 'certificates' && (
          <CertificatesTab
            domainId={id}
            intermediateCert={data.intermediateCert}
            entityCertCount={data.entityCertCount}
          />
        )}
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
    </div>
  );
}

// Groups Tab Component
function GroupsTab({ domainId }: { domainId: string }) {
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
        <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm">
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
  intermediateCert,
  entityCertCount,
}: {
  domainId: string;
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
  plcConfig,
  identityCount,
  handleSuffix,
  onUpdate,
  isUpdating,
}: {
  domainId: string;
  plcConfig?: {
    enabled: boolean;
    mode: 'standalone' | 'external' | 'disabled';
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
  const queryClient = useQueryClient();

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
              {(['standalone', 'external', 'disabled'] as const).map((mode) => (
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
              {localConfig.mode === 'disabled' && 'Disable PLC functionality for this domain'}
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
          <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm">
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
          <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors text-sm">
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
