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
  StatCard,
  Modal,
  ModalBody,
  ModalFooter,
  ConfirmDialog,
  PageSkeleton,
} from '@/components/admin/ui';

interface CRLEntry {
  serialNumber: string;
  revocationDate: string;
  reason: string;
  issuerSubject: string;
  subjectCommonName?: string;
}

interface CRLInfo {
  id: string;
  issuer: string;
  thisUpdate: string;
  nextUpdate: string;
  entriesCount: number;
  size: number;
  version: number;
  signature: string;
}

export default function CRLManagementPage() {
  const queryClient = useQueryClient();
  const [selectedCRL, setSelectedCRL] = useState<CRLInfo | null>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [viewEntries, setViewEntries] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ca', 'crl'],
    queryFn: () => api.caGetCRLs(),
  });

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['admin', 'ca', 'crl', viewEntries, 'entries'],
    queryFn: () => api.caGetCRLEntries(viewEntries!),
    enabled: !!viewEntries,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.caGenerateCRL(),
    onSuccess: () => {
      toast.success('CRL generated successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ca', 'crl'] });
      setShowGenerateConfirm(false);
    },
    onError: () => {
      toast.error('Failed to generate CRL');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const crls = data?.crls || [];
  const stats = data?.stats || {
    totalCRLs: 0,
    totalEntries: 0,
    lastGenerated: null,
    nextScheduled: null,
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const crlColumns: Column<CRLInfo>[] = [
    {
      key: 'issuer',
      header: 'Issuer',
      render: (row) => (
        <div>
          <p className="text-sm font-medium text-text-primary">{row.issuer}</p>
          <p className="text-xs text-text-muted">Version {row.version}</p>
        </div>
      ),
    },
    {
      key: 'entries',
      header: 'Revoked Certs',
      render: (row) => (
        <span className="text-sm text-text-primary">{row.entriesCount}</span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (row) => (
        <span className="text-sm text-text-muted">{formatBytes(row.size)}</span>
      ),
    },
    {
      key: 'thisUpdate',
      header: 'Generated',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.thisUpdate).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'nextUpdate',
      header: 'Next Update',
      render: (row) => {
        const isOverdue = new Date(row.nextUpdate) < new Date();
        return (
          <span className={`text-sm ${isOverdue ? 'text-warning' : 'text-text-muted'}`}>
            {new Date(row.nextUpdate).toLocaleString()}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row) => (
        <div className="flex gap-2">
          <button
            onClick={() => setViewEntries(row.id)}
            className="px-3 py-1.5 text-sm text-accent hover:underline"
          >
            View Entries
          </button>
          <button
            onClick={() => window.open(`/api/ca/crl/${row.id}/download`, '_blank')}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Download
          </button>
        </div>
      ),
    },
  ];

  const entryColumns: Column<CRLEntry>[] = [
    {
      key: 'serial',
      header: 'Serial Number',
      render: (row) => (
        <span className="text-sm font-mono text-text-primary">{row.serialNumber.slice(0, 20)}...</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span className="text-sm text-text-muted">{row.subjectCommonName || 'Unknown'}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <Badge variant="error">{row.reason}</Badge>
      ),
    },
    {
      key: 'date',
      header: 'Revocation Date',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.revocationDate).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificate Revocation Lists"
        description="Manage and generate CRLs for your certificate authorities"
        actions={
          <button
            onClick={() => setShowGenerateConfirm(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Generate CRL
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total CRLs"
          value={stats.totalCRLs}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          title="Revoked Certificates"
          value={stats.totalEntries}
          variant="error"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatCard
          title="Last Generated"
          value={stats.lastGenerated ? new Date(stats.lastGenerated).toLocaleDateString() : 'Never'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Next Scheduled"
          value={stats.nextScheduled ? new Date(stats.nextScheduled).toLocaleDateString() : 'Not set'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* CRL Table */}
      <DataTable
        data={crls}
        columns={crlColumns}
        keyExtractor={(row) => row.id}
        emptyMessage="CRLs"
      />

      {/* CRL Distribution Points */}
      <div className="p-6 bg-surface border border-border rounded-xl">
        <h3 className="text-lg font-semibold text-text-primary mb-4">CRL Distribution Points</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
            <div>
              <p className="text-sm font-medium text-text-primary">Primary CDP</p>
              <p className="text-xs text-text-muted font-mono">https://crl.exprsn.io/root.crl</p>
            </div>
            <Badge variant="success" dot>Active</Badge>
          </div>
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
            <div>
              <p className="text-sm font-medium text-text-primary">Secondary CDP</p>
              <p className="text-xs text-text-muted font-mono">https://crl2.exprsn.io/root.crl</p>
            </div>
            <Badge variant="success" dot>Active</Badge>
          </div>
        </div>
      </div>

      {/* Generate Confirmation */}
      <ConfirmDialog
        isOpen={showGenerateConfirm}
        onClose={() => setShowGenerateConfirm(false)}
        onConfirm={() => generateMutation.mutate()}
        title="Generate New CRL?"
        message="This will generate a new Certificate Revocation List including all currently revoked certificates. The CRL will be published to all distribution points."
        confirmLabel="Generate"
        isLoading={generateMutation.isPending}
      />

      {/* View Entries Modal */}
      <Modal
        isOpen={!!viewEntries}
        onClose={() => setViewEntries(null)}
        title="CRL Entries"
        size="lg"
      >
        <ModalBody>
          {entriesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
          ) : (
            <DataTable
              data={entriesData?.entries || []}
              columns={entryColumns}
              keyExtractor={(row) => row.serialNumber}
              emptyMessage="revoked certificates"
            />
          )}
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => setViewEntries(null)}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
