'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCount } from '@/lib/utils';

type CertStatus = 'all' | 'active' | 'revoked' | 'expired';
type CertType = 'all' | 'client' | 'server' | 'root';

interface Certificate {
  id: string;
  commonName: string;
  serialNumber: string;
  fingerprint: string;
  certType: 'client' | 'server' | 'root';
  status: 'active' | 'revoked' | 'expired';
  subjectDid?: string;
  serviceId?: string;
  notBefore: string;
  notAfter: string;
  createdAt: string;
}

interface RootCertificate {
  id: string;
  commonName: string;
  serialNumber: string;
  fingerprint: string;
  status: 'active' | 'revoked';
  notBefore: string;
  notAfter: string;
  issuedCount: number;
}

export default function CertificatesAdmin() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<CertStatus>('all');
  const [typeFilter, setTypeFilter] = useState<CertType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch CA stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'certificates', 'stats'],
    queryFn: async () => {
      return {
        totalCertificates: 156,
        activeCertificates: 142,
        revokedCertificates: 8,
        expiredCertificates: 6,
        rootCertificates: 2,
        expiringIn30Days: 12,
      };
    },
  });

  // Fetch root certificates
  const { data: rootCerts, isLoading: rootLoading } = useQuery({
    queryKey: ['admin', 'certificates', 'roots'],
    queryFn: async () => {
      const mockRoots: RootCertificate[] = [
        {
          id: 'root_001',
          commonName: 'Exprsn Root CA',
          serialNumber: '01:AB:CD:EF',
          fingerprint: 'SHA256:abc123...',
          status: 'active',
          notBefore: '2024-01-01T00:00:00Z',
          notAfter: '2034-01-01T00:00:00Z',
          issuedCount: 145,
        },
        {
          id: 'root_002',
          commonName: 'Exprsn Intermediate CA',
          serialNumber: '02:AB:CD:EF',
          fingerprint: 'SHA256:def456...',
          status: 'active',
          notBefore: '2024-01-01T00:00:00Z',
          notAfter: '2029-01-01T00:00:00Z',
          issuedCount: 11,
        },
      ];
      return mockRoots;
    },
  });

  // Fetch entity certificates
  const { data: certificates, isLoading: certsLoading } = useQuery({
    queryKey: ['admin', 'certificates', 'entities', statusFilter, typeFilter],
    queryFn: async () => {
      const mockCerts: Certificate[] = [
        {
          id: 'cert_001',
          commonName: 'api.exprsn.io',
          serialNumber: '10:AB:CD:EF',
          fingerprint: 'SHA256:srv123...',
          certType: 'server',
          status: 'active',
          serviceId: 'api-service',
          notBefore: '2024-06-01T00:00:00Z',
          notAfter: '2025-06-01T00:00:00Z',
          createdAt: '2024-06-01T00:00:00Z',
        },
        {
          id: 'cert_002',
          commonName: 'feed-generator.exprsn.io',
          serialNumber: '11:AB:CD:EF',
          fingerprint: 'SHA256:srv456...',
          certType: 'server',
          status: 'active',
          serviceId: 'feed-generator',
          notBefore: '2024-06-01T00:00:00Z',
          notAfter: '2025-06-01T00:00:00Z',
          createdAt: '2024-06-01T00:00:00Z',
        },
        {
          id: 'cert_003',
          commonName: 'did:web:user1.exprsn.io',
          serialNumber: '20:AB:CD:EF',
          fingerprint: 'SHA256:cli789...',
          certType: 'client',
          status: 'active',
          subjectDid: 'did:web:user1.exprsn.io',
          notBefore: '2024-08-01T00:00:00Z',
          notAfter: '2025-08-01T00:00:00Z',
          createdAt: '2024-08-01T00:00:00Z',
        },
        {
          id: 'cert_004',
          commonName: 'did:web:olduser.exprsn.io',
          serialNumber: '21:AB:CD:EF',
          fingerprint: 'SHA256:cli000...',
          certType: 'client',
          status: 'revoked',
          subjectDid: 'did:web:olduser.exprsn.io',
          notBefore: '2024-01-01T00:00:00Z',
          notAfter: '2025-01-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];
      return mockCerts;
    },
  });

  // Revoke certificate mutation
  const revokeMutation = useMutation({
    mutationFn: async (certId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
      setSelectedCert(null);
    },
  });

  // Create certificate mutation
  const createMutation = useMutation({
    mutationFn: async (data: { commonName: string; certType: string; validity: number }) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { id: 'new_cert', ...data };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] });
      setShowCreateModal(false);
    },
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/10 text-green-500',
      revoked: 'bg-red-500/10 text-red-500',
      expired: 'bg-gray-500/10 text-gray-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.active}`}>
        {status}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      root: 'bg-purple-500/10 text-purple-500',
      server: 'bg-blue-500/10 text-blue-500',
      client: 'bg-cyan-500/10 text-cyan-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[type] || styles.client}`}>
        {type}
      </span>
    );
  };

  const daysUntilExpiry = (notAfter: string) => {
    const expiry = new Date(notAfter);
    const now = new Date();
    const diff = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (statsLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Certificate Authority</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Issue Certificate
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Total Certificates"
          value={formatCount(stats?.totalCertificates || 0)}
          icon={CertIcon}
        />
        <StatCard
          label="Active"
          value={formatCount(stats?.activeCertificates || 0)}
          icon={CheckIcon}
          color="green"
        />
        <StatCard
          label="Revoked"
          value={formatCount(stats?.revokedCertificates || 0)}
          icon={RevokedIcon}
          color="red"
        />
        <StatCard
          label="Expiring Soon"
          value={(stats?.expiringIn30Days || 0).toString()}
          icon={WarningIcon}
          highlight
        />
      </div>

      {/* Root Certificates */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Root Certificates</h2>
        <div className="space-y-3">
          {rootCerts?.map((root) => (
            <div key={root.id} className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <RootCertIcon className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{root.commonName}</p>
                  <p className="text-xs text-text-muted font-mono">{root.fingerprint}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-text-primary">{root.issuedCount} issued</p>
                  <p className="text-xs text-text-muted">
                    Expires: {new Date(root.notAfter).toLocaleDateString()}
                  </p>
                </div>
                {getStatusBadge(root.status)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search certificates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CertStatus)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CertType)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="all">All Types</option>
          <option value="client">Client</option>
          <option value="server">Server</option>
          <option value="root">Root</option>
        </select>
      </div>

      {/* Certificates Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Entity Certificates</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Common Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Serial</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {certificates?.map((cert) => {
                const days = daysUntilExpiry(cert.notAfter);
                return (
                  <tr key={cert.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-text-primary">{cert.commonName}</p>
                      <p className="text-xs text-text-muted font-mono">{cert.fingerprint}</p>
                    </td>
                    <td className="px-4 py-3">{getTypeBadge(cert.certType)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-text-muted">{cert.serialNumber}</td>
                    <td className="px-4 py-3">{getStatusBadge(cert.status)}</td>
                    <td className="px-4 py-3">
                      <p className={`text-sm ${days < 30 ? 'text-yellow-500' : days < 7 ? 'text-red-500' : 'text-text-muted'}`}>
                        {days > 0 ? `${days} days` : 'Expired'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedCert(cert)}
                          className="text-accent hover:underline text-sm"
                        >
                          View
                        </button>
                        {cert.status === 'active' && (
                          <button
                            onClick={() => {
                              setSelectedCert(cert);
                            }}
                            className="text-red-500 hover:underline text-sm"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Certificate Detail Modal */}
      {selectedCert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Certificate Details</h3>
              <button
                onClick={() => setSelectedCert(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-muted">Common Name</p>
                <p className="text-sm font-medium text-text-primary">{selectedCert.commonName}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Type</p>
                  {getTypeBadge(selectedCert.certType)}
                </div>
                <div>
                  <p className="text-xs text-text-muted">Status</p>
                  {getStatusBadge(selectedCert.status)}
                </div>
              </div>
              <div>
                <p className="text-xs text-text-muted">Serial Number</p>
                <p className="text-sm font-mono text-text-primary">{selectedCert.serialNumber}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Fingerprint</p>
                <p className="text-sm font-mono text-text-primary break-all">{selectedCert.fingerprint}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Valid From</p>
                  <p className="text-sm text-text-primary">{new Date(selectedCert.notBefore).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Valid Until</p>
                  <p className="text-sm text-text-primary">{new Date(selectedCert.notAfter).toLocaleDateString()}</p>
                </div>
              </div>
              {selectedCert.subjectDid && (
                <div>
                  <p className="text-xs text-text-muted">Subject DID</p>
                  <p className="text-sm text-text-primary truncate">{selectedCert.subjectDid}</p>
                </div>
              )}
              {selectedCert.serviceId && (
                <div>
                  <p className="text-xs text-text-muted">Service ID</p>
                  <p className="text-sm text-text-primary">{selectedCert.serviceId}</p>
                </div>
              )}
              {selectedCert.status === 'active' && (
                <button
                  onClick={() => revokeMutation.mutate(selectedCert.id)}
                  disabled={revokeMutation.isPending}
                  className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {revokeMutation.isPending ? 'Revoking...' : 'Revoke Certificate'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Certificate Modal */}
      {showCreateModal && (
        <CreateCertificateModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  );
}

function CreateCertificateModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (data: { commonName: string; certType: string; validity: number }) => void;
  isPending: boolean;
}) {
  const [commonName, setCommonName] = useState('');
  const [certType, setCertType] = useState('client');
  const [validity, setValidity] = useState(365);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Issue New Certificate</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ commonName, certType, validity });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm text-text-muted mb-1">Common Name</label>
            <input
              type="text"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="e.g., api.exprsn.io or did:web:user.exprsn.io"
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Certificate Type</label>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value)}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="client">Client Certificate</option>
              <option value="server">Server Certificate</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Validity (days)</label>
            <select
              value={validity}
              onChange={(e) => setValidity(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value={90}>90 days</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isPending || !commonName}
            className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Issuing...' : 'Issue Certificate'}
          </button>
        </form>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  color?: 'green' | 'red' | 'yellow';
  highlight?: boolean;
}

function StatCard({ label, value, icon: Icon, color, highlight }: StatCardProps) {
  const colorStyles = {
    green: 'text-green-500',
    red: 'text-red-500',
    yellow: 'text-yellow-500',
  };

  return (
    <div className={`bg-surface border rounded-xl p-6 ${highlight ? 'border-yellow-500' : 'border-border'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color ? colorStyles[color] : 'text-text-primary'}`}>{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-yellow-500/10' : 'bg-surface-hover'}`}>
          <Icon className={`w-6 h-6 ${highlight ? 'text-yellow-500' : color ? colorStyles[color] : 'text-text-muted'}`} />
        </div>
      </div>
    </div>
  );
}

function CertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RevokedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function RootCertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
