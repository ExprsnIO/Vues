'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  PageHeader,
  DataTable,
  Column,
  Badge,
  SimpleTabs,
  SearchInput,
  FilterDropdown,
  PageSkeleton,
  RowActionMenu,
} from '@/components/admin/ui';
import { CertificateCard, IssueCertificateWizard, RevokeConfirmation } from '@/components/admin/certificates';

interface EntityCertificate {
  id: string;
  subject: string;
  type: 'server' | 'client' | 'code_signing';
  serialNumber: string;
  status: 'active' | 'revoked' | 'expired';
  notBefore: string;
  notAfter: string;
  algorithm: string;
  keySize: number;
  issuer: {
    id: string;
    subject: string;
  };
  subjectAltNames?: string[];
  keyUsage?: string[];
}

export default function EntityCertificatesPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [showIssueWizard, setShowIssueWizard] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<EntityCertificate | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ca', 'entities', activeTab, search, typeFilter, statusFilter, page],
    queryFn: () => api.caGetEntityCertificates({
      status: activeTab !== 'all' ? activeTab : undefined,
      search: search || undefined,
      types: typeFilter.length > 0 ? typeFilter : undefined,
      limit: 25,
      offset: (page - 1) * 25,
    }),
  });

  const { data: issuersData } = useQuery({
    queryKey: ['admin', 'ca', 'issuers'],
    queryFn: () => api.caGetAvailableIssuers(),
  });

  const issueMutation = useMutation({
    mutationFn: (data: any) => api.caIssueCertificate(data),
    onSuccess: () => {
      toast.success('Certificate issued successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ca', 'entities'] });
      setShowIssueWizard(false);
    },
    onError: () => {
      toast.error('Failed to issue certificate');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.caRevokeCertificate(id, reason),
    onSuccess: () => {
      toast.success('Certificate revoked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ca', 'entities'] });
      setRevokeTarget(null);
    },
    onError: () => {
      toast.error('Failed to revoke certificate');
    },
  });

  if (isLoading && page === 1) {
    return <PageSkeleton />;
  }

  const certificates = data?.certificates || [];
  const total = data?.total || 0;
  const stats = data?.stats || { total: 0, active: 0, revoked: 0, expired: 0, server: 0, client: 0, codeSigning: 0 };

  const tabs = [
    { id: 'all', label: 'All Certificates', badge: stats.total },
    { id: 'active', label: 'Active', badge: stats.active },
    { id: 'revoked', label: 'Revoked', badge: stats.revoked },
    { id: 'expired', label: 'Expired', badge: stats.expired },
  ];

  const typeOptions = [
    { value: 'server', label: 'Server' },
    { value: 'client', label: 'Client' },
    { value: 'code_signing', label: 'Code Signing' },
  ];

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'revoked', label: 'Revoked' },
    { value: 'expired', label: 'Expired' },
  ];

  const typeColors: Record<string, 'info' | 'success' | 'warning' | 'default'> = {
    server: 'info',
    client: 'success',
    code_signing: 'warning',
  };

  const columns: Column<EntityCertificate>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-text-primary">{row.subject}</p>
          <p className="text-xs text-text-muted font-mono">{row.serialNumber.slice(0, 20)}...</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge variant={typeColors[row.type] || 'default'}>
          {row.type.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          variant={row.status === 'active' ? 'success' : row.status === 'revoked' ? 'error' : 'warning'}
          dot
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'issuer',
      header: 'Issuer',
      render: (row) => (
        <span className="text-sm text-text-muted truncate max-w-[150px] block">
          {row.issuer.subject}
        </span>
      ),
    },
    {
      key: 'validity',
      header: 'Expires',
      render: (row) => {
        const daysLeft = Math.ceil((new Date(row.notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return (
          <div className="text-sm">
            <p className="text-text-muted">{new Date(row.notAfter).toLocaleDateString()}</p>
            {row.status === 'active' && daysLeft > 0 && (
              <p className={daysLeft < 30 ? 'text-warning' : 'text-text-muted'}>
                {daysLeft} days
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row) => (
        <RowActionMenu
          items={[
            { label: 'View Details', onClick: () => {} },
            { label: 'Download PEM', onClick: () => {} },
            row.status === 'active'
              ? { label: 'Revoke', onClick: () => setRevokeTarget(row), variant: 'danger' as const }
              : null,
          ].filter(Boolean) as any}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entity Certificates"
        description="Manage end-entity certificates for servers, clients, and code signing"
        actions={
          <button
            onClick={() => setShowIssueWizard(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Issue Certificate
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-muted">Server Certificates</p>
              <p className="text-2xl font-semibold text-text-primary">{stats.server}</p>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
          </div>
        </div>
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-muted">Client Certificates</p>
              <p className="text-2xl font-semibold text-text-primary">{stats.client}</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          </div>
        </div>
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-muted">Code Signing</p>
              <p className="text-2xl font-semibold text-text-primary">{stats.codeSigning}</p>
            </div>
            <div className="p-3 bg-yellow-500/10 rounded-lg">
              <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SimpleTabs tabs={tabs} activeTab={activeTab} onChange={(tab) => { setActiveTab(tab); setPage(1); }} />
        <div className="flex-1" />
        <SearchInput
          value={search}
          onChange={(value) => { setSearch(value); setPage(1); }}
          placeholder="Search certificates..."
          className="w-64"
        />
        <FilterDropdown
          label="Type"
          options={typeOptions}
          value={typeFilter}
          onChange={(value) => { setTypeFilter(value); setPage(1); }}
        />
      </div>

      {/* Table */}
      <DataTable
        data={certificates}
        columns={columns}
        keyExtractor={(row) => row.id}
        loading={isLoading}
        totalCount={total}
        pageSize={25}
        currentPage={page}
        onPageChange={setPage}
        emptyMessage="certificates"
      />

      {/* Issue Wizard */}
      <IssueCertificateWizard
        isOpen={showIssueWizard}
        onClose={() => setShowIssueWizard(false)}
        onSubmit={issueMutation.mutate}
        isSubmitting={issueMutation.isPending}
        availableIssuers={issuersData?.issuers || []}
      />

      {/* Revoke Confirmation */}
      {revokeTarget && (
        <RevokeConfirmation
          isOpen={!!revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={(reason) => revokeMutation.mutate({ id: revokeTarget.id, reason })}
          isLoading={revokeMutation.isPending}
          certificate={{
            id: revokeTarget.id,
            subject: revokeTarget.subject,
            type: revokeTarget.type,
            serialNumber: revokeTarget.serialNumber,
            notAfter: revokeTarget.notAfter,
          }}
        />
      )}
    </div>
  );
}
