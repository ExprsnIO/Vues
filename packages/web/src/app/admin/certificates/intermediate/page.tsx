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
  Modal,
  ModalBody,
  ModalFooter,
  FormField,
  Input,
  Select,
  PageSkeleton,
  SearchInput,
  FilterDropdown,
} from '@/components/admin/ui';
import { CAHierarchyTree, IssueCertificateWizard } from '@/components/admin/certificates';

interface IntermediateCA {
  id: string;
  subject: string;
  serialNumber: string;
  status: 'active' | 'revoked' | 'expired';
  notBefore: string;
  notAfter: string;
  algorithm: string;
  keySize: number;
  issuedCount: number;
  issuer: {
    id: string;
    subject: string;
  };
  pathLength?: number;
}

export default function IntermediateCAsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedCA, setSelectedCA] = useState<IntermediateCA | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ca', 'intermediate', search, statusFilter],
    queryFn: () => api.caGetIntermediateCAs({
      search: search || undefined,
      status: statusFilter.length > 0 ? statusFilter : undefined,
    }),
  });

  const { data: issuersData } = useQuery({
    queryKey: ['admin', 'ca', 'issuers'],
    queryFn: () => api.caGetAvailableIssuers(),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.caCreateIntermediate(data),
    onSuccess: () => {
      toast.success('Intermediate CA created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ca'] });
      setShowCreateWizard(false);
    },
    onError: () => {
      toast.error('Failed to create Intermediate CA');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const intermediateCAs = data?.intermediates || [];
  const hierarchy = data?.hierarchy || [];

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'revoked', label: 'Revoked' },
    { value: 'expired', label: 'Expired' },
  ];

  const columns: Column<IntermediateCA>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-text-primary">{row.subject}</p>
          <p className="text-xs text-text-muted">Issued by: {row.issuer.subject}</p>
        </div>
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
      key: 'algorithm',
      header: 'Algorithm',
      render: (row) => (
        <span className="text-sm text-text-muted">{row.algorithm} {row.keySize}-bit</span>
      ),
    },
    {
      key: 'issued',
      header: 'Issued',
      render: (row) => (
        <span className="text-sm text-text-primary">{row.issuedCount} certificates</span>
      ),
    },
    {
      key: 'pathLength',
      header: 'Path Length',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {row.pathLength !== undefined ? row.pathLength : 'Unlimited'}
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
            {row.status === 'active' && (
              <p className={daysLeft < 90 ? 'text-warning' : 'text-text-muted'}>
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
        <button
          onClick={() => setSelectedCA(row)}
          className="px-3 py-1.5 text-sm text-accent hover:underline"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intermediate Certificate Authorities"
        description="Manage intermediate CAs for issuing end-entity certificates"
        actions={
          <button
            onClick={() => setShowCreateWizard(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Create Intermediate CA
          </button>
        }
      />

      {/* View Toggle & Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search CAs..."
            className="w-64"
          />
          <FilterDropdown
            label="Status"
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="flex items-center gap-2 bg-surface-hover rounded-lg p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-surface text-text-primary' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              viewMode === 'tree' ? 'bg-surface text-text-primary' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <DataTable
          data={intermediateCAs}
          columns={columns}
          keyExtractor={(row) => row.id}
          emptyMessage="intermediate CAs"
          onRowClick={setSelectedCA}
        />
      ) : (
        <div className="p-6 bg-surface border border-border rounded-xl">
          <CAHierarchyTree
            certificates={hierarchy}
            onSelect={(cert) => {
              const ca = intermediateCAs.find(c => c.id === cert.id);
              if (ca) setSelectedCA(ca);
            }}
            selectedId={selectedCA?.id}
          />
        </div>
      )}

      {/* Create Wizard */}
      <IssueCertificateWizard
        isOpen={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        onSubmit={createMutation.mutate}
        isSubmitting={createMutation.isPending}
        availableIssuers={issuersData?.issuers || []}
      />

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedCA}
        onClose={() => setSelectedCA(null)}
        title="Intermediate CA Details"
        size="lg"
      >
        {selectedCA && (
          <>
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Subject</p>
                  <p className="text-sm font-medium text-text-primary">{selectedCA.subject}</p>
                </div>
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Issuer</p>
                  <p className="text-sm font-medium text-text-primary">{selectedCA.issuer.subject}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Status</p>
                  <Badge
                    variant={selectedCA.status === 'active' ? 'success' : selectedCA.status === 'revoked' ? 'error' : 'warning'}
                    dot
                  >
                    {selectedCA.status}
                  </Badge>
                </div>
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Algorithm</p>
                  <p className="text-sm text-text-primary">{selectedCA.algorithm} {selectedCA.keySize}-bit</p>
                </div>
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Certificates Issued</p>
                  <p className="text-sm text-text-primary">{selectedCA.issuedCount}</p>
                </div>
              </div>

              <div className="p-4 bg-surface-hover rounded-lg">
                <p className="text-xs text-text-muted mb-1">Serial Number</p>
                <p className="text-sm font-mono text-text-primary break-all">{selectedCA.serialNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Valid From</p>
                  <p className="text-sm text-text-primary">{new Date(selectedCA.notBefore).toLocaleString()}</p>
                </div>
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Valid Until</p>
                  <p className="text-sm text-text-primary">{new Date(selectedCA.notAfter).toLocaleString()}</p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <button
                onClick={() => setSelectedCA(null)}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Close
              </button>
              {selectedCA.status === 'active' && (
                <button className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                  Revoke
                </button>
              )}
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}
