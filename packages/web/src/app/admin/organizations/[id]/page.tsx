'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type OrganizationView } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminOrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const queryClient = useQueryClient();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showChangeParentModal, setShowChangeParentModal] = useState(false);
  const [showCreateSubOrgModal, setShowCreateSubOrgModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'limits' | 'features' | 'integrations' | 'storage'>('general');
  const [settings, setSettings] = useState({
    // General
    verified: false,
    apiAccessEnabled: true,
    webhooksEnabled: false,
    // Rate Limits
    rateLimitPerMinute: null as number | null,
    burstLimit: null as number | null,
    dailyRequestLimit: null as number | null,
    // Feature Flags
    liveStreamingEnabled: false,
    videoUploadEnabled: true,
    collaborationEnabled: false,
    analyticsEnabled: true,
    monetizationEnabled: false,
    customBrandingEnabled: false,
    // Integrations
    ssoEnabled: false,
    ssoProvider: null as string | null,
    ssoEntityId: null as string | null,
    oauthEnabled: false,
    slackIntegration: false,
    discordIntegration: false,
    // Storage & Quotas
    storageQuotaGb: null as number | null,
    maxVideoDurationMin: null as number | null,
    maxVideoSizeMb: null as number | null,
    maxMembersLimit: null as number | null,
    dataRetentionDays: null as number | null,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'organization', orgId],
    queryFn: () => api.getAdminOrganization(orgId),
    enabled: !!orgId,
  });

  const { data: ancestorsData } = useQuery({
    queryKey: ['admin', 'organization', orgId, 'ancestors'],
    queryFn: () => api.getOrganizationAncestors(orgId),
    enabled: !!orgId,
  });

  const { data: childrenData } = useQuery({
    queryKey: ['admin', 'organization', orgId, 'children'],
    queryFn: () => api.getOrganizationChildren(orgId),
    enabled: !!orgId,
  });

  const { data: allOrgsData } = useQuery({
    queryKey: ['admin', 'organizations', 'list'],
    queryFn: () => api.adminListOrganizations({ limit: 100 }),
    enabled: showChangeParentModal,
  });

  const setParentMutation = useMutation({
    mutationFn: (parentId: string | null) => api.setOrganizationParent(orgId, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organization', orgId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'organization', orgId, 'ancestors'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'organization', orgId, 'children'] });
      toast.success('Parent organization updated');
      setShowChangeParentModal(false);
    },
    onError: () => {
      toast.error('Failed to update parent organization');
    },
  });

  const createSubOrgMutation = useMutation({
    mutationFn: (subOrgData: { name: string; type: 'team' | 'enterprise' | 'nonprofit' | 'business' | 'standard'; description?: string }) =>
      api.adminCreateOrganization({ ...subOrgData, parentOrganizationId: orgId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organization', orgId, 'children'] });
      toast.success('Sub-organization created');
      setShowCreateSubOrgModal(false);
    },
    onError: () => {
      toast.error('Failed to create sub-organization');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof api.updateAdminOrganization>[0]) =>
      api.updateAdminOrganization(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organization', orgId] });
      toast.success('Organization updated');
      setShowSettingsModal(false);
    },
    onError: () => {
      toast.error('Failed to update organization');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAdminOrganization({ id: orgId, reason: deleteReason }),
    onSuccess: () => {
      toast.success('Organization deleted');
      router.push('/admin/organizations');
    },
    onError: () => {
      toast.error('Failed to delete organization');
    },
  });

  const openSettingsModal = () => {
    if (data?.organization) {
      // Cast to extended type to access optional configuration properties
      const org = data.organization as typeof data.organization & {
        liveStreamingEnabled?: boolean;
        videoUploadEnabled?: boolean;
        collaborationEnabled?: boolean;
        analyticsEnabled?: boolean;
        monetizationEnabled?: boolean;
        customBrandingEnabled?: boolean;
        ssoEnabled?: boolean;
        ssoProvider?: string | null;
        ssoEntityId?: string | null;
        oauthEnabled?: boolean;
        slackIntegration?: boolean;
        discordIntegration?: boolean;
        storageQuotaGb?: number | null;
        maxVideoDurationMin?: number | null;
        maxVideoSizeMb?: number | null;
        maxMembersLimit?: number | null;
        dataRetentionDays?: number | null;
      };
      setSettings({
        // General
        verified: org.verified,
        apiAccessEnabled: org.apiAccessEnabled,
        webhooksEnabled: org.webhooksEnabled,
        // Rate Limits
        rateLimitPerMinute: org.rateLimitPerMinute ?? null,
        burstLimit: org.burstLimit ?? null,
        dailyRequestLimit: org.dailyRequestLimit ?? null,
        // Feature Flags
        liveStreamingEnabled: org.liveStreamingEnabled ?? false,
        videoUploadEnabled: org.videoUploadEnabled ?? true,
        collaborationEnabled: org.collaborationEnabled ?? false,
        analyticsEnabled: org.analyticsEnabled ?? true,
        monetizationEnabled: org.monetizationEnabled ?? false,
        customBrandingEnabled: org.customBrandingEnabled ?? false,
        // Integrations
        ssoEnabled: org.ssoEnabled ?? false,
        ssoProvider: org.ssoProvider ?? null,
        ssoEntityId: org.ssoEntityId ?? null,
        oauthEnabled: org.oauthEnabled ?? false,
        slackIntegration: org.slackIntegration ?? false,
        discordIntegration: org.discordIntegration ?? false,
        // Storage & Quotas
        storageQuotaGb: org.storageQuotaGb ?? null,
        maxVideoDurationMin: org.maxVideoDurationMin ?? null,
        maxVideoSizeMb: org.maxVideoSizeMb ?? null,
        maxMembersLimit: org.maxMembersLimit ?? null,
        dataRetentionDays: org.dataRetentionDays ?? null,
      });
      setSettingsTab('general');
      setShowSettingsModal(true);
    }
  };

  const handleSaveSettings = () => {
    updateMutation.mutate({
      id: orgId,
      ...settings,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Organization not found</p>
        <Link href="/admin/organizations" className="text-accent hover:underline mt-2 inline-block">
          Back to organizations
        </Link>
      </div>
    );
  }

  const { organization, owner, stats, recentActivity } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/organizations"
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-surface-hover overflow-hidden">
              {organization.avatar ? (
                <img src={organization.avatar} alt={organization.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-muted text-2xl font-semibold">
                  {organization.name[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                {organization.name}
                {organization.verified && (
                  <svg className="w-6 h-6 text-accent" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </h1>
              <p className="text-text-muted">{organization.type} organization</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openSettingsModal}
            className="px-4 py-2 bg-surface-hover hover:bg-border rounded-lg transition-colors text-text-primary"
          >
            Settings
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Members" value={stats.totalMembers} />
        <StatCard label="Active Members" value={stats.activeMembers} color="green" />
        <StatCard label="Suspended Members" value={stats.suspendedMembers} color="red" />
        <StatCard
          label="API Access"
          value={organization.apiAccessEnabled ? 'Enabled' : 'Disabled'}
          color={organization.apiAccessEnabled ? 'green' : 'orange'}
        />
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Info */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Organization Details</h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-sm text-text-muted">ID</dt>
              <dd className="text-text-primary font-mono text-sm">{organization.id}</dd>
            </div>
            {organization.description && (
              <div>
                <dt className="text-sm text-text-muted">Description</dt>
                <dd className="text-text-primary">{organization.description}</dd>
              </div>
            )}
            {organization.website && (
              <div>
                <dt className="text-sm text-text-muted">Website</dt>
                <dd>
                  <a
                    href={organization.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {organization.website}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-text-muted">Created</dt>
              <dd className="text-text-primary">{new Date(organization.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Last Updated</dt>
              <dd className="text-text-primary">{new Date(organization.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        {/* Owner Info */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Owner</h2>
          {owner ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-surface-hover overflow-hidden">
                {owner.avatar ? (
                  <img src={owner.avatar} alt={owner.handle} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                    {owner.handle[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium text-text-primary">{owner.displayName || owner.handle}</p>
                <p className="text-sm text-text-muted">@{owner.handle}</p>
              </div>
              <Link
                href={`/admin/users/${encodeURIComponent(owner.did)}`}
                className="ml-auto px-3 py-1 text-sm bg-surface-hover hover:bg-border rounded transition-colors"
              >
                View User
              </Link>
            </div>
          ) : (
            <p className="text-text-muted">Owner information not available</p>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">Rate Limits</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-muted">Per Minute</dt>
                <dd className="text-text-primary">
                  {organization.rateLimitPerMinute ?? 'Default'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Burst Limit</dt>
                <dd className="text-text-primary">{organization.burstLimit ?? 'Default'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Daily Limit</dt>
                <dd className="text-text-primary">
                  {organization.dailyRequestLimit ?? 'Default'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Webhooks</dt>
                <dd className="text-text-primary">
                  {organization.webhooksEnabled ? 'Enabled' : 'Disabled'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Hierarchy Section */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Organization Hierarchy</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowChangeParentModal(true)}
              className="px-3 py-1.5 text-sm bg-surface-hover hover:bg-border rounded-lg transition-colors text-text-primary"
            >
              Change Parent
            </button>
            <button
              onClick={() => setShowCreateSubOrgModal(true)}
              className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Add Sub-Organization
            </button>
          </div>
        </div>

        {/* Breadcrumb ancestors */}
        {ancestorsData && ancestorsData.ancestors.length > 0 && (
          <div className="mb-5">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Parent Chain</p>
            <nav className="flex items-center gap-1 flex-wrap">
              {ancestorsData.ancestors.map((ancestor, index) => (
                <span key={ancestor.id} className="flex items-center gap-1">
                  {index > 0 && (
                    <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  <Link
                    href={`/admin/organizations/${ancestor.id}`}
                    className="text-sm text-accent hover:underline font-medium"
                  >
                    {ancestor.name}
                  </Link>
                </span>
              ))}
              <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-semibold text-text-primary">{organization.name}</span>
            </nav>
          </div>
        )}

        {/* Child organizations */}
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wide mb-3">
            Sub-Organizations
            {childrenData && childrenData.organizations.length > 0 && (
              <span className="ml-1 normal-case">({childrenData.organizations.length})</span>
            )}
          </p>
          {!childrenData || childrenData.organizations.length === 0 ? (
            <p className="text-sm text-text-muted">No sub-organizations</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {childrenData.organizations.map((child) => (
                <Link
                  key={child.id}
                  href={`/admin/organizations/${child.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center overflow-hidden flex-shrink-0">
                    <span className="text-text-muted font-semibold text-sm">
                      {child.name[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-text-primary truncate">{child.name}</span>
                      {child.verified && (
                        <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <OrgTypeBadge type={child.type} />
                      <span className="text-xs text-text-muted">{child.memberCount} members</span>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Activity</h2>
        {recentActivity.length === 0 ? (
          <p className="text-text-muted">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-4 py-2 border-b border-border last:border-0"
              >
                <div className="flex-1">
                  <p className="text-text-primary">{formatActivityAction(activity.action)}</p>
                  <p className="text-sm text-text-muted">
                    by {activity.actor?.handle || 'Unknown'} at{' '}
                    {new Date(activity.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSettingsModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Organization Settings</h2>
              <p className="text-sm text-text-muted mt-1">Configure organization capabilities and limits</p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border px-6 overflow-x-auto">
              {[
                { id: 'general' as const, label: 'General', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )},
                { id: 'limits' as const, label: 'Rate Limits', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )},
                { id: 'features' as const, label: 'Features', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                )},
                { id: 'integrations' as const, label: 'Integrations', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                  </svg>
                )},
                { id: 'storage' as const, label: 'Storage', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                )},
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative whitespace-nowrap ${
                    settingsTab === tab.id
                      ? 'text-accent'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {settingsTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* General Tab */}
              {settingsTab === 'general' && (
                <div className="space-y-3">
                  <ToggleSetting
                    label="Verified Organization"
                    description="Display verification badge on organization profile"
                    checked={settings.verified}
                    onChange={(checked) => setSettings({ ...settings, verified: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                    }
                  />
                  <ToggleSetting
                    label="API Access"
                    description="Allow programmatic API access for this organization"
                    checked={settings.apiAccessEnabled}
                    onChange={(checked) => setSettings({ ...settings, apiAccessEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    }
                  />
                  <ToggleSetting
                    label="Webhooks"
                    description="Enable outgoing webhook notifications"
                    checked={settings.webhooksEnabled}
                    onChange={(checked) => setSettings({ ...settings, webhooksEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    }
                  />
                </div>
              )}

              {/* Rate Limits Tab */}
              {settingsTab === 'limits' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
                    <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-amber-600 dark:text-amber-400">Leave fields empty to use system defaults</p>
                  </div>
                  <NumberInput
                    label="Requests per minute"
                    value={settings.rateLimitPerMinute}
                    onChange={(val) => setSettings({ ...settings, rateLimitPerMinute: val })}
                    placeholder="60"
                    suffix="req/min"
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />
                  <NumberInput
                    label="Burst limit"
                    value={settings.burstLimit}
                    onChange={(val) => setSettings({ ...settings, burstLimit: val })}
                    placeholder="100"
                    suffix="requests"
                    description="Maximum requests allowed in a short burst"
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    }
                  />
                  <NumberInput
                    label="Daily request limit"
                    value={settings.dailyRequestLimit}
                    onChange={(val) => setSettings({ ...settings, dailyRequestLimit: val })}
                    placeholder="Unlimited"
                    suffix="req/day"
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    }
                  />
                </div>
              )}

              {/* Features Tab */}
              {settingsTab === 'features' && (
                <div className="space-y-3">
                  <ToggleSetting
                    label="Video Upload"
                    description="Allow members to upload videos"
                    checked={settings.videoUploadEnabled}
                    onChange={(checked) => setSettings({ ...settings, videoUploadEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    }
                  />
                  <ToggleSetting
                    label="Live Streaming"
                    description="Enable live streaming capabilities"
                    checked={settings.liveStreamingEnabled}
                    onChange={(checked) => setSettings({ ...settings, liveStreamingEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    }
                  />
                  <ToggleSetting
                    label="Collaboration Tools"
                    description="Enable collaborative editing and shared projects"
                    checked={settings.collaborationEnabled}
                    onChange={(checked) => setSettings({ ...settings, collaborationEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    }
                  />
                  <ToggleSetting
                    label="Analytics Dashboard"
                    description="Access to detailed analytics and insights"
                    checked={settings.analyticsEnabled}
                    onChange={(checked) => setSettings({ ...settings, analyticsEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    }
                  />
                  <ToggleSetting
                    label="Monetization"
                    description="Enable creator monetization features"
                    checked={settings.monetizationEnabled}
                    onChange={(checked) => setSettings({ ...settings, monetizationEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                  />
                  <ToggleSetting
                    label="Custom Branding"
                    description="Allow custom themes and branding"
                    checked={settings.customBrandingEnabled}
                    onChange={(checked) => setSettings({ ...settings, customBrandingEnabled: checked })}
                    icon={
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                    }
                  />
                </div>
              )}

              {/* Integrations Tab */}
              {settingsTab === 'integrations' && (
                <div className="space-y-6">
                  {/* SSO Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/10">
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </div>
                      <h3 className="font-medium text-text-primary">Single Sign-On (SSO)</h3>
                    </div>
                    <ToggleSetting
                      label="Enable SSO"
                      description="Allow users to sign in via SAML/OIDC"
                      checked={settings.ssoEnabled}
                      onChange={(checked) => setSettings({ ...settings, ssoEnabled: checked })}
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      }
                    />
                    {settings.ssoEnabled && (
                      <div className="ml-4 space-y-4 border-l-2 border-accent/30 pl-4 py-2 bg-accent/5 rounded-r-lg">
                        <div>
                          <label className="block text-sm font-medium text-text-primary mb-1.5">SSO Provider</label>
                          <select
                            value={settings.ssoProvider || ''}
                            onChange={(e) => setSettings({ ...settings, ssoProvider: e.target.value || null })}
                            className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-accent transition-all"
                          >
                            <option value="">Select provider...</option>
                            <option value="okta">Okta</option>
                            <option value="azure_ad">Azure AD</option>
                            <option value="google_workspace">Google Workspace</option>
                            <option value="onelogin">OneLogin</option>
                            <option value="custom_saml">Custom SAML</option>
                            <option value="custom_oidc">Custom OIDC</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-primary mb-1.5">Entity ID / Client ID</label>
                          <input
                            type="text"
                            value={settings.ssoEntityId || ''}
                            onChange={(e) => setSettings({ ...settings, ssoEntityId: e.target.value || null })}
                            placeholder="Enter entity ID..."
                            className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent focus:border-accent transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* OAuth Section */}
                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-purple-500/10">
                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h3 className="font-medium text-text-primary">OAuth Applications</h3>
                    </div>
                    <ToggleSetting
                      label="Allow OAuth Apps"
                      description="Let organization create OAuth applications"
                      checked={settings.oauthEnabled}
                      onChange={(checked) => setSettings({ ...settings, oauthEnabled: checked })}
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      }
                    />
                  </div>

                  {/* Third-Party Section */}
                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-green-500/10">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <h3 className="font-medium text-text-primary">Third-Party Integrations</h3>
                    </div>
                    <ToggleSetting
                      label="Slack Integration"
                      description="Connect with Slack workspaces"
                      checked={settings.slackIntegration}
                      onChange={(checked) => setSettings({ ...settings, slackIntegration: checked })}
                      icon={
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                        </svg>
                      }
                    />
                    <ToggleSetting
                      label="Discord Integration"
                      description="Connect with Discord servers"
                      checked={settings.discordIntegration}
                      onChange={(checked) => setSettings({ ...settings, discordIntegration: checked })}
                      icon={
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                        </svg>
                      }
                    />
                  </div>
                </div>
              )}

              {/* Storage & Quotas Tab */}
              {settingsTab === 'storage' && (
                <div className="space-y-6">
                  {/* Storage Section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/10">
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                      </div>
                      <h3 className="font-medium text-text-primary">Storage Limits</h3>
                    </div>
                    <NumberInput
                      label="Storage quota"
                      value={settings.storageQuotaGb}
                      onChange={(val) => setSettings({ ...settings, storageQuotaGb: val })}
                      placeholder="Unlimited"
                      suffix="GB"
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      }
                    />
                  </div>

                  {/* Video Limits Section */}
                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-purple-500/10">
                        <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h3 className="font-medium text-text-primary">Video Limits</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <NumberInput
                        label="Max duration"
                        value={settings.maxVideoDurationMin}
                        onChange={(val) => setSettings({ ...settings, maxVideoDurationMin: val })}
                        placeholder="60"
                        suffix="min"
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        }
                      />
                      <NumberInput
                        label="Max file size"
                        value={settings.maxVideoSizeMb}
                        onChange={(val) => setSettings({ ...settings, maxVideoSizeMb: val })}
                        placeholder="500"
                        suffix="MB"
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        }
                      />
                    </div>
                  </div>

                  {/* Organization Limits Section */}
                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-green-500/10">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h3 className="font-medium text-text-primary">Organization Limits</h3>
                    </div>
                    <NumberInput
                      label="Maximum members"
                      value={settings.maxMembersLimit}
                      onChange={(val) => setSettings({ ...settings, maxMembersLimit: val })}
                      placeholder="Unlimited"
                      suffix="members"
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      }
                    />
                    <NumberInput
                      label="Data retention period"
                      value={settings.dataRetentionDays}
                      onChange={(val) => setSettings({ ...settings, dataRetentionDays: val })}
                      placeholder="Forever"
                      suffix="days"
                      description="How long to keep deleted content before permanent removal"
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-border">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Parent Modal */}
      {showChangeParentModal && (
        <ChangeParentModal
          currentOrgId={orgId}
          currentParentId={ancestorsData?.ancestors[ancestorsData.ancestors.length - 1]?.id ?? null}
          organizations={allOrgsData?.organizations ?? []}
          onConfirm={(parentId) => setParentMutation.mutate(parentId)}
          onClose={() => setShowChangeParentModal(false)}
          isPending={setParentMutation.isPending}
        />
      )}

      {/* Create Sub-Organization Modal */}
      {showCreateSubOrgModal && (
        <CreateSubOrgModal
          parentName={organization.name}
          onConfirm={(subOrgData) => createSubOrgMutation.mutate(subOrgData)}
          onClose={() => setShowCreateSubOrgModal(false)}
          isPending={createSubOrgMutation.isPending}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Delete Organization</h2>
            <p className="text-text-muted mb-4">
              This will permanently delete &quot;{organization.name}&quot; and all its data. This action
              cannot be undone.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-text-primary mb-2">
                Reason for deletion
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted resize-none h-24"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteReason('');
                }}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={!deleteReason.trim() || deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Organization'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrgTypeBadge({ type }: { type: string }) {
  const typeConfig: Record<string, string> = {
    team: 'bg-blue-500/10 text-blue-500',
    company: 'bg-purple-500/10 text-purple-500',
    brand: 'bg-pink-500/10 text-pink-500',
    enterprise: 'bg-indigo-500/10 text-indigo-500',
    nonprofit: 'bg-green-500/10 text-green-500',
    business: 'bg-orange-500/10 text-orange-500',
    network: 'bg-teal-500/10 text-teal-500',
    standard: 'bg-gray-500/10 text-gray-500',
  };
  const colorClass = typeConfig[type] ?? 'bg-gray-500/10 text-gray-500';
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${colorClass}`}>
      {type}
    </span>
  );
}

function ChangeParentModal({
  currentOrgId,
  currentParentId,
  organizations,
  onConfirm,
  onClose,
  isPending,
}: {
  currentOrgId: string;
  currentParentId: string | null;
  organizations: Array<{ id: string; name: string; type: string; verified: boolean }>;
  onConfirm: (parentId: string | null) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(currentParentId);

  const filtered = organizations.filter(
    (o) =>
      o.id !== currentOrgId &&
      (search === '' || o.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Change Parent Organization</h2>
          <p className="text-sm text-text-muted mt-1">Select a new parent or make this a root organization.</p>
        </div>

        <div className="p-4 border-b border-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organizations..."
            className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent focus:border-accent transition-all text-sm"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {/* Remove parent option */}
          <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors">
            <input
              type="radio"
              name="parent-org"
              checked={selectedId === null}
              onChange={() => setSelectedId(null)}
              className="accent-accent"
            />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-hover border border-border flex items-center justify-center">
                <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">No parent (root organization)</p>
                <p className="text-xs text-text-muted">Remove parent and make this a top-level org</p>
              </div>
            </div>
          </label>

          {filtered.length === 0 && search !== '' && (
            <p className="text-sm text-text-muted text-center py-6">No organizations match &quot;{search}&quot;</p>
          )}

          {filtered.map((org) => (
            <label
              key={org.id}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover cursor-pointer transition-colors"
            >
              <input
                type="radio"
                name="parent-org"
                checked={selectedId === org.id}
                onChange={() => setSelectedId(org.id)}
                className="accent-accent"
              />
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center overflow-hidden flex-shrink-0">
                  <span className="text-text-muted font-semibold text-xs">
                    {org.name[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-text-primary truncate">{org.name}</span>
                    {org.verified && (
                      <svg className="w-3 h-3 text-accent flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <OrgTypeBadge type={org.type} />
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selectedId)}
            disabled={isPending || selectedId === currentParentId}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Set Parent'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateSubOrgModal({
  parentName,
  onConfirm,
  onClose,
  isPending,
}: {
  parentName: string;
  onConfirm: (data: { name: string; type: 'team' | 'enterprise' | 'nonprofit' | 'business' | 'standard'; description?: string }) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'team' | 'enterprise' | 'nonprofit' | 'business' | 'standard'>('team');
  const [description, setDescription] = useState('');

  const canSubmit = name.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Add Sub-Organization</h2>
          <p className="text-sm text-text-muted mt-1">
            Create a new organization under <span className="font-medium text-text-primary">{parentName}</span>.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sub-organization name"
              className="w-full px-4 py-2.5 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent focus:border-accent transition-all text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-accent transition-all text-sm"
            >
              <option value="team">Team</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
              <option value="nonprofit">Nonprofit</option>
              <option value="standard">Standard</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-4 py-2.5 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent focus:border-accent transition-all text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm({
                name: name.trim(),
                type,
                description: description.trim() || undefined,
              })
            }
            disabled={isPending || !canSubmit}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create Sub-Organization'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: 'green' | 'red' | 'orange';
}) {
  const colorClasses = {
    green: 'text-green-500',
    red: 'text-red-500',
    orange: 'text-orange-500',
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`text-2xl font-bold ${color ? colorClasses[color] : 'text-text-primary'}`}>
        {value}
      </p>
    </div>
  );
}

function formatActivityAction(action: string): string {
  const actionMap: Record<string, string> = {
    member_joined: 'Member joined',
    member_left: 'Member left',
    member_suspended: 'Member suspended',
    member_activated: 'Member activated',
    member_updated: 'Member updated',
    role_changed: 'Role changed',
    password_reset: 'Password reset',
    tag_created: 'Tag created',
    tag_deleted: 'Tag deleted',
    ownership_transferred: 'Ownership transferred',
    import_started: 'Import started',
    import_completed: 'Import completed',
  };

  return actionMap[action] || action.replace(/_/g, ' ');
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange,
  icon,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors">
      <div className="flex items-start gap-3">
        {icon && (
          <div className={`mt-0.5 p-2 rounded-lg ${checked ? 'bg-accent/10 text-accent' : 'bg-border text-text-muted'} transition-colors`}>
            {icon}
          </div>
        )}
        <div>
          <label className="text-text-primary font-medium cursor-pointer" onClick={() => onChange(!checked)}>
            {label}
          </label>
          <p className="text-sm text-text-muted mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface ${
          checked ? 'bg-accent' : 'bg-border'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  description,
  icon,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (val: number | null) => void;
  placeholder?: string;
  description?: string;
  icon?: React.ReactNode;
  suffix?: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-surface-hover/50 hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-3 mb-2">
        {icon && (
          <div className="p-2 rounded-lg bg-border text-text-muted">
            {icon}
          </div>
        )}
        <label className="text-sm font-medium text-text-primary">{label}</label>
      </div>
      <div className="relative">
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : null)}
          placeholder={placeholder}
          className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:ring-2 focus:ring-accent focus:border-accent transition-all"
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            {suffix}
          </span>
        )}
      </div>
      {description && <p className="text-xs text-text-muted mt-2">{description}</p>}
    </div>
  );
}
