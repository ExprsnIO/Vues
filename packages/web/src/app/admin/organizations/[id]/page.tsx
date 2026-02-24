'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminOrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const queryClient = useQueryClient();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState({
    verified: false,
    apiAccessEnabled: true,
    rateLimitPerMinute: null as number | null,
    burstLimit: null as number | null,
    dailyRequestLimit: null as number | null,
    webhooksEnabled: false,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'organization', orgId],
    queryFn: () => api.getAdminOrganization(orgId),
    enabled: !!orgId,
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
      setSettings({
        verified: data.organization.verified,
        apiAccessEnabled: data.organization.apiAccessEnabled,
        rateLimitPerMinute: data.organization.rateLimitPerMinute ?? null,
        burstLimit: data.organization.burstLimit ?? null,
        dailyRequestLimit: data.organization.dailyRequestLimit ?? null,
        webhooksEnabled: data.organization.webhooksEnabled,
      });
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
          <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-6">Organization Settings</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-text-primary font-medium">Verified</label>
                    <p className="text-sm text-text-muted">Mark organization as verified</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.verified}
                    onChange={(e) => setSettings({ ...settings, verified: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-text-primary font-medium">API Access</label>
                    <p className="text-sm text-text-muted">Allow API access for this organization</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.apiAccessEnabled}
                    onChange={(e) => setSettings({ ...settings, apiAccessEnabled: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-text-primary font-medium">Webhooks</label>
                    <p className="text-sm text-text-muted">Enable webhook notifications</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.webhooksEnabled}
                    onChange={(e) => setSettings({ ...settings, webhooksEnabled: e.target.checked })}
                    className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                  />
                </div>

                <div className="pt-4 border-t border-border">
                  <h3 className="text-text-primary font-medium mb-3">Rate Limits</h3>
                  <p className="text-sm text-text-muted mb-4">Leave empty to use system defaults</p>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm text-text-muted mb-1">Requests per minute</label>
                      <input
                        type="number"
                        value={settings.rateLimitPerMinute ?? ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            rateLimitPerMinute: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        placeholder="Default"
                        className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-text-muted mb-1">Burst limit</label>
                      <input
                        type="number"
                        value={settings.burstLimit ?? ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            burstLimit: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        placeholder="Default"
                        className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-text-muted mb-1">Daily request limit</label>
                      <input
                        type="number"
                        value={settings.dailyRequestLimit ?? ''}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            dailyRequestLimit: e.target.value ? parseInt(e.target.value) : null,
                          })
                        }
                        placeholder="Default"
                        className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
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
        </div>
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
