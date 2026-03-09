'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';
import {
  PageHeader,
  SearchInput,
  FilterDropdown,
  DataTable,
  Column,
  Badge,
  RowActionMenu,
  PageSkeleton,
} from '@/components/admin/ui';

interface Organization {
  id: string;
  name: string;
  handle: string;
  description?: string;
  memberCount: number;
  verified: boolean;
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
  avatar?: string;
}

export default function DomainOrganizationsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrg, setNewOrg] = useState({
    name: '',
    type: 'team' as 'team' | 'enterprise' | 'nonprofit' | 'business',
  });

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'organizations', search, statusFilter, page],
    queryFn: () =>
      api.adminDomainOrganizationsList(domainId, {
        search: search || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        limit: 25,
        offset: (page - 1) * 25,
      }),
    enabled: !!domainId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.adminCreateOrganization({ ...newOrg, domainId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'organizations'] });
      toast.success('Organization created');
      setShowCreateModal(false);
      setNewOrg({ name: '', type: 'team' });
    },
    onError: () => toast.error('Failed to create organization'),
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateAdminOrganization>[0]) => api.updateAdminOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'organizations'] });
      toast.success('Organization updated');
    },
    onError: () => toast.error('Failed to update organization'),
  });

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load organizations</p>
      </div>
    );
  }

  const organizations = data?.organizations || [];
  const totalCount = data?.total || 0;

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'pending', label: 'Pending' },
  ];

  const columns: Column<Organization>[] = [
    {
      key: 'organization',
      header: 'Organization',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-hover overflow-hidden flex-shrink-0">
            {row.avatar ? (
              <img src={row.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                {row.name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-primary">{row.name}</p>
              {row.verified && (
                <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <p className="text-xs text-text-muted">@{row.handle}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <span className="text-sm text-text-muted truncate max-w-[250px] block">
          {row.description || '-'}
        </span>
      ),
    },
    {
      key: 'members',
      header: 'Members',
      render: (row) => (
        <span className="text-sm text-text-primary">{row.memberCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          variant={row.status === 'active' ? 'success' : row.status === 'suspended' ? 'error' : 'warning'}
          dot
        >
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row) => (
        <RowActionMenu
          items={[
            { label: 'View Details', onClick: () => router.push(`/admin/d/${domainId}/organizations/${row.id}`) },
            { label: 'View Members', onClick: () => router.push(`/admin/d/${domainId}/organizations/${row.id}/members`) },
            row.verified
              ? { label: 'Remove Verification', onClick: () => updateOrganizationMutation.mutate({ id: row.id, verified: false }) }
              : { label: 'Verify', onClick: () => updateOrganizationMutation.mutate({ id: row.id, verified: true }) },
            row.status === 'suspended'
              ? { label: 'Unsuspend', onClick: () => updateOrganizationMutation.mutate({ id: row.id, status: 'active' }) }
              : { label: 'Suspend', onClick: () => updateOrganizationMutation.mutate({ id: row.id, status: 'suspended' }), variant: 'danger' as const },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description={`Organizations in ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Create Organization
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search organizations..."
          className="w-64"
        />
        <FilterDropdown
          label="Status"
          options={statusOptions}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
        />
      </div>

      <DataTable
        data={organizations}
        columns={columns}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        totalCount={totalCount}
        pageSize={25}
        currentPage={page}
        onPageChange={setPage}
        onRowClick={(row) => router.push(`/admin/d/${domainId}/organizations/${row.id}`)}
        emptyMessage="organizations"
      />

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative w-full max-w-md bg-surface border border-border rounded-xl p-6">
            <h2 className="text-xl font-bold text-text-primary mb-4">Create Organization</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Name</label>
                <input
                  type="text"
                  value={newOrg.name}
                  onChange={(e) => setNewOrg((current) => ({ ...current, name: e.target.value }))}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Type</label>
                <select
                  value={newOrg.type}
                  onChange={(e) => setNewOrg((current) => ({ ...current, type: e.target.value as typeof newOrg.type }))}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                >
                  <option value="team">Team</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="nonprofit">Nonprofit</option>
                  <option value="business">Business</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newOrg.name || createMutation.isPending}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
