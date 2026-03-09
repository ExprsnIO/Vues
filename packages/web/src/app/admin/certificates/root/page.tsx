// @ts-nocheck
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
  ConfirmDialog,
  PageSkeleton,
  StatCard,
} from '@/components/admin/ui';
import { CertificateCard, CertificateDetail } from '@/components/admin/certificates';

interface RootCA {
  id: string;
  subject: string;
  serialNumber: string;
  status: 'active' | 'revoked' | 'expired';
  notBefore: string;
  notAfter: string;
  algorithm: string;
  keySize: number;
  issuedCount: number;
  fingerprint: {
    sha1: string;
    sha256: string;
  };
}

export default function RootCAPage() {
  const queryClient = useQueryClient();
  const [showInitModal, setShowInitModal] = useState(false);
  const [selectedCA, setSelectedCA] = useState<RootCA | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  const [initForm, setInitForm] = useState({
    commonName: '',
    organization: '',
    country: 'US',
    validityYears: 10,
    keySize: 4096 as 2048 | 4096,
    algorithm: 'RSA' as 'RSA' | 'ECDSA',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ca', 'root'],
    queryFn: () => api.caGetRootCAs(),
  });

  const initMutation = useMutation({
    mutationFn: (data: typeof initForm) => api.caInitializeRoot({
      subject: {
        commonName: data.commonName,
        organization: data.organization,
        country: data.country,
      },
      validityDays: data.validityYears * 365,
      keySize: data.keySize,
      algorithm: data.algorithm,
    }),
    onSuccess: () => {
      toast.success('Root CA initialized successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ca'] });
      setShowInitModal(false);
      setInitForm({
        commonName: '',
        organization: '',
        country: 'US',
        validityYears: 10,
        keySize: 4096,
        algorithm: 'RSA',
      });
    },
    onError: () => {
      toast.error('Failed to initialize Root CA');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.caRevokeRootCA(id, 'cessationOfOperation'),
    onSuccess: () => {
      toast.success('Root CA revoked');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ca'] });
      setShowRevokeConfirm(false);
      setSelectedCA(null);
    },
    onError: () => {
      toast.error('Failed to revoke Root CA');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const rootCAs = data?.roots || [];
  const stats = data?.stats || { total: 0, active: 0, revoked: 0, totalIssued: 0 };

  const columns: Column<RootCA>[] = [
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
      header: 'Certificates Issued',
      render: (row) => (
        <span className="text-sm text-text-primary">{row.issuedCount}</span>
      ),
    },
    {
      key: 'validity',
      header: 'Validity',
      render: (row) => {
        const daysLeft = Math.ceil((new Date(row.notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return (
          <div className="text-sm">
            <p className="text-text-muted">
              {new Date(row.notBefore).toLocaleDateString()} - {new Date(row.notAfter).toLocaleDateString()}
            </p>
            {row.status === 'active' && (
              <p className={daysLeft < 365 ? 'text-warning' : 'text-green-500'}>
                {daysLeft} days remaining
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
          View Details
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Root Certificate Authorities"
        description="Manage root CAs that anchor your PKI trust chain"
        actions={
          <button
            onClick={() => setShowInitModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Initialize Root CA
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Total Root CAs"
          value={stats.total}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        />
        <StatCard
          title="Active"
          value={stats.active}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          title="Revoked"
          value={stats.revoked}
          variant="error"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
        />
        <StatCard
          title="Certificates Issued"
          value={stats.totalIssued}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
      </div>

      {/* Table */}
      <DataTable
        data={rootCAs}
        columns={columns}
        keyExtractor={(row) => row.id}
        emptyMessage="root CAs"
        onRowClick={setSelectedCA}
      />

      {/* Initialize Modal */}
      <Modal
        isOpen={showInitModal}
        onClose={() => setShowInitModal(false)}
        title="Initialize Root CA"
        size="md"
      >
        <ModalBody className="space-y-4">
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-500">
              Creating a Root CA is a critical operation. Ensure you have proper key ceremony procedures in place.
            </p>
          </div>

          <FormField label="Common Name (CN)" required>
            <Input
              value={initForm.commonName}
              onChange={(e) => setInitForm({ ...initForm, commonName: e.target.value })}
              placeholder="e.g., Exprsn Root CA"
            />
          </FormField>

          <FormField label="Organization (O)">
            <Input
              value={initForm.organization}
              onChange={(e) => setInitForm({ ...initForm, organization: e.target.value })}
              placeholder="e.g., Exprsn Inc."
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Country (C)">
              <Input
                value={initForm.country}
                onChange={(e) => setInitForm({ ...initForm, country: e.target.value })}
                placeholder="US"
                maxLength={2}
              />
            </FormField>
            <FormField label="Validity (Years)">
              <Input
                type="number"
                value={initForm.validityYears}
                onChange={(e) => setInitForm({ ...initForm, validityYears: parseInt(e.target.value) || 10 })}
                min={1}
                max={30}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Algorithm">
              <Select
                value={initForm.algorithm}
                onChange={(e: any) => setInitForm({ ...initForm, algorithm: e.target.value })}
              >
                <option value="RSA">RSA</option>
                <option value="ECDSA">ECDSA</option>
              </Select>
            </FormField>
            <FormField label="Key Size">
              <Select
                value={initForm.keySize}
                onChange={(e: any) => setInitForm({ ...initForm, keySize: parseInt(e.target.value) })}
              >
                <option value={2048}>2048-bit</option>
                <option value={4096}>4096-bit (Recommended)</option>
              </Select>
            </FormField>
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => setShowInitModal(false)}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => initMutation.mutate(initForm)}
            disabled={initMutation.isPending || !initForm.commonName}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {initMutation.isPending ? 'Initializing...' : 'Initialize Root CA'}
          </button>
        </ModalFooter>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedCA}
        onClose={() => setSelectedCA(null)}
        title="Root CA Details"
        size="lg"
      >
        {selectedCA && (
          <>
            <ModalBody>
              <CertificateDetail
                certificate={{
                  id: selectedCA.id,
                  subject: selectedCA.subject,
                  type: 'root',
                  status: selectedCA.status,
                  serialNumber: selectedCA.serialNumber,
                  notBefore: selectedCA.notBefore,
                  notAfter: selectedCA.notAfter,
                  algorithm: selectedCA.algorithm,
                  keySize: selectedCA.keySize,
                  fingerprint: selectedCA.fingerprint,
                  keyUsage: ['keyCertSign', 'cRLSign'],
                }}
                onRevoke={() => setShowRevokeConfirm(true)}
              />
            </ModalBody>
            <ModalFooter>
              <button
                onClick={() => setSelectedCA(null)}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Close
              </button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Revoke Confirmation */}
      <ConfirmDialog
        isOpen={showRevokeConfirm}
        onClose={() => setShowRevokeConfirm(false)}
        onConfirm={() => selectedCA && revokeMutation.mutate(selectedCA.id)}
        title="Revoke Root CA?"
        message="This will revoke the Root CA and invalidate ALL certificates in its chain. This action cannot be undone."
        confirmLabel="Revoke"
        variant="danger"
        isLoading={revokeMutation.isPending}
      />
    </div>
  );
}
