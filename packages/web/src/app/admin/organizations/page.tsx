'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api, AdminOrganization } from '@/lib/api';
import { ExportButton } from '@/components/admin/ExportModal';
import { CreateOrganizationModal } from '@/components/admin/CreateOrganizationModal';
import toast from 'react-hot-toast';

export default function AdminOrganizationsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [apiAccessFilter, setApiAccessFilter] = useState('');
  const [sort, setSort] = useState('recent');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<'verify' | 'unverify' | 'enableApi' | 'disableApi' | 'delete' | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'organizations', { search, typeFilter, verifiedFilter, apiAccessFilter, sort }],
    queryFn: () =>
      api.getAdminOrganizations({
        q: search || undefined,
        type: typeFilter || undefined,
        verified: verifiedFilter || undefined,
        apiAccess: apiAccessFilter || undefined,
        sort,
      }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      api.updateAdminOrganization({ id, verified }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      toast.success('Organization updated');
    },
    onError: () => {
      toast.error('Failed to update organization');
    },
  });

  const bulkVerifyMutation = useMutation({
    mutationFn: (data: { orgIds: string[]; verified: boolean }) =>
      api.bulkVerifyOrganizations(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      toast.success(`${data.summary.action} ${data.summary.succeeded} organization(s)`);
      setSelectedIds(new Set());
      setShowBulkModal(false);
    },
    onError: () => {
      toast.error('Bulk operation failed');
    },
  });

  const bulkApiAccessMutation = useMutation({
    mutationFn: (data: { orgIds: string[]; apiAccessEnabled: boolean }) =>
      api.bulkUpdateOrgApiAccess(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      toast.success(`API access ${data.summary.action} for ${data.summary.succeeded} organization(s)`);
      setSelectedIds(new Set());
      setShowBulkModal(false);
    },
    onError: () => {
      toast.error('Bulk operation failed');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (data: { orgIds: string[]; reason: string }) =>
      api.bulkDeleteOrganizations(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] });
      toast.success(`Deleted ${data.summary.succeeded} organization(s)`);
      setSelectedIds(new Set());
      setShowBulkModal(false);
      setDeleteReason('');
    },
    onError: () => {
      toast.error('Bulk delete failed');
    },
  });

  const organizations = data?.organizations || [];

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === organizations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(organizations.map((o) => o.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkAction = (action: typeof bulkAction) => {
    setBulkAction(action);
    setShowBulkModal(true);
  };

  const executeBulkAction = () => {
    const orgIds = Array.from(selectedIds);

    switch (bulkAction) {
      case 'verify':
        bulkVerifyMutation.mutate({ orgIds, verified: true });
        break;
      case 'unverify':
        bulkVerifyMutation.mutate({ orgIds, verified: false });
        break;
      case 'enableApi':
        bulkApiAccessMutation.mutate({ orgIds, apiAccessEnabled: true });
        break;
      case 'disableApi':
        bulkApiAccessMutation.mutate({ orgIds, apiAccessEnabled: false });
        break;
      case 'delete':
        if (!deleteReason.trim()) {
          toast.error('Please provide a reason');
          return;
        }
        bulkDeleteMutation.mutate({ orgIds, reason: deleteReason });
        break;
    }
  };

  const isAllSelected = organizations.length > 0 && selectedIds.size === organizations.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < organizations.length;
  const isLoading_ = bulkVerifyMutation.isPending || bulkApiAccessMutation.isPending || bulkDeleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Organizations</h1>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <span className="text-sm text-text-muted">{selectedIds.size} selected</span>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create Organization
          </button>
          <ExportButton
            exportType="organizations"
            filters={{
              type: typeFilter || undefined,
              verified: verifiedFilter ? verifiedFilter === 'true' : undefined,
              apiAccess: apiAccessFilter ? apiAccessFilter === 'enabled' : undefined,
            }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All types</option>
          <option value="team">Team</option>
          <option value="enterprise">Enterprise</option>
          <option value="nonprofit">Nonprofit</option>
          <option value="business">Business</option>
        </select>
        <select
          value={verifiedFilter}
          onChange={(e) => setVerifiedFilter(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All status</option>
          <option value="true">Verified</option>
          <option value="false">Unverified</option>
        </select>
        <select
          value={apiAccessFilter}
          onChange={(e) => setApiAccessFilter(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All API access</option>
          <option value="enabled">API Enabled</option>
          <option value="disabled">API Disabled</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="recent">Most Recent</option>
          <option value="members">Most Members</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>

      {/* Organizations Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Organization
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Owner
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : organizations.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-text-muted">
                  No organizations found
                </td>
              </tr>
            ) : (
              organizations.map((org) => (
                <tr
                  key={org.id}
                  className={`hover:bg-surface-hover ${selectedIds.has(org.id) ? 'bg-accent/5' : ''}`}
                >
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(org.id)}
                      onChange={() => toggleSelection(org.id)}
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-hover overflow-hidden flex-shrink-0">
                        {org.avatar ? (
                          <img src={org.avatar} alt={org.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                            {org.name[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-text-primary flex items-center gap-1">
                          {org.name}
                          {org.verified && <VerifiedBadge className="w-4 h-4 text-accent" />}
                        </p>
                        {org.description && (
                          <p className="text-sm text-text-muted truncate max-w-[200px]">{org.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <TypeBadge type={org.type} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <StatusBadge verified={org.verified} />
                      {!org.apiAccessEnabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500">
                          API Disabled
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-text-primary">{org.memberCount}</td>
                  <td className="px-6 py-4">
                    {org.owner ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-hover overflow-hidden">
                          {org.owner.avatar ? (
                            <img src={org.owner.avatar} alt={org.owner.handle} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-muted text-xs">
                              {org.owner.handle[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-sm text-text-muted">@{org.owner.handle}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-text-muted">Unknown</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-text-muted">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => verifyMutation.mutate({ id: org.id, verified: !org.verified })}
                        className="px-3 py-1 text-sm bg-surface-hover hover:bg-border rounded transition-colors"
                        disabled={verifyMutation.isPending}
                      >
                        {org.verified ? 'Unverify' : 'Verify'}
                      </button>
                      <Link
                        href={`/admin/organizations/${org.id}`}
                        className="px-3 py-1 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-surface border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-4">
            <span className="text-text-primary font-medium">
              {selectedIds.size} organization{selectedIds.size !== 1 ? 's' : ''} selected
            </span>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkAction('verify')}
                className="px-3 py-1.5 text-sm bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg transition-colors"
              >
                Verify
              </button>
              <button
                onClick={() => handleBulkAction('unverify')}
                className="px-3 py-1.5 text-sm bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 rounded-lg transition-colors"
              >
                Unverify
              </button>
              <button
                onClick={() => handleBulkAction('enableApi')}
                className="px-3 py-1.5 text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition-colors"
              >
                Enable API
              </button>
              <button
                onClick={() => handleBulkAction('disableApi')}
                className="px-3 py-1.5 text-sm bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 rounded-lg transition-colors"
              >
                Disable API
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                className="px-3 py-1.5 text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>

            <div className="h-6 w-px bg-border" />

            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Confirm Bulk {bulkAction === 'verify' ? 'Verify' : bulkAction === 'unverify' ? 'Unverify' : bulkAction === 'enableApi' ? 'Enable API' : bulkAction === 'disableApi' ? 'Disable API' : 'Delete'}
            </h2>
            <p className="text-text-muted mb-4">
              This will affect {selectedIds.size} organization{selectedIds.size !== 1 ? 's' : ''}.
            </p>

            {bulkAction === 'delete' && (
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
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBulkModal(false);
                  setDeleteReason('');
                }}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkAction}
                disabled={isLoading_}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  bulkAction === 'delete'
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-accent hover:bg-accent-hover text-text-inverse'
                } disabled:opacity-50`}
              >
                {isLoading_ ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      <CreateOrganizationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    team: 'bg-blue-500/10 text-blue-500',
    enterprise: 'bg-purple-500/10 text-purple-500',
    nonprofit: 'bg-green-500/10 text-green-500',
    business: 'bg-orange-500/10 text-orange-500',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[type] || styles.team}`}>
      {type}
    </span>
  );
}

function StatusBadge({ verified }: { verified: boolean }) {
  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${
        verified ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
      }`}
    >
      {verified ? 'Verified' : 'Unverified'}
    </span>
  );
}

function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
