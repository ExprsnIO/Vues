// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface Certificate {
  id: string;
  commonName: string;
  certType: 'client' | 'server' | 'code_signing';
  serialNumber: string;
  fingerprint: string;
  status: 'active' | 'revoked' | 'expired';
  notBefore: string;
  notAfter: string;
  subjectDid?: string;
  serviceId?: string;
  createdAt: string;
}

interface IntermediateCert {
  id: string;
  commonName: string;
  serialNumber: string;
  fingerprint: string;
  notBefore: string;
  notAfter: string;
  status: string;
}

interface RootCA {
  id: string;
  certificate: string;
  serialNumber: string;
  fingerprint: string;
  notBefore: string;
  notAfter: string;
}

type ModalType = 'issue' | 'initRoot' | 'createIntermediate' | 'download' | null;

export default function DomainCertificatesPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  // Fetch domain data with intermediate cert
  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: async () => {
      const res = await api.get(`/xrpc/io.exprsn.admin.domains.get?domainId=${domainId}`);
      return res.data;
    },
    enabled: !!domainId,
  });

  // Fetch Root CA
  const { data: rootCAData, isLoading: rootLoading } = useQuery({
    queryKey: ['ca', 'root'],
    queryFn: async () => {
      const res = await api.get('/xrpc/io.exprsn.ca.getRootCertificate');
      return res.data as RootCA;
    },
  });

  // Fetch certificates for domain
  const { data: certsData, isLoading: certsLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'certificates', filterType, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({ domainId });
      if (filterType !== 'all') params.set('certType', filterType);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await api.get(`/xrpc/io.exprsn.admin.certificates.list?${params}`);
      return res.data;
    },
    enabled: !!domainId,
  });

  // Initialize Root CA
  const initRootMutation = useMutation({
    mutationFn: async (data: { commonName: string; organization: string; validityDays: number }) => {
      const res = await api.post('/xrpc/io.exprsn.ca.initializeRoot', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ca', 'root'] });
      toast.success('Root CA initialized successfully');
      setActiveModal(null);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to initialize Root CA'),
  });

  // Create Intermediate CA for domain
  const createIntermediateMutation = useMutation({
    mutationFn: async (data: { commonName: string; organization?: string; validityDays?: number }) => {
      const res = await api.post('/xrpc/io.exprsn.admin.domains.createIntermediateCA', {
        domainId,
        ...data,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      queryClient.invalidateQueries({ queryKey: ['ca', 'root'] });
      toast.success('Intermediate CA created and linked to domain');
      setActiveModal(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || err.message || 'Failed to create Intermediate CA'),
  });

  // Issue certificate
  const issueMutation = useMutation({
    mutationFn: async (data: {
      certType: 'client' | 'server' | 'code_signing';
      commonName: string;
      organization?: string;
      validityDays: number;
      subjectAltNames?: { dnsNames?: string[]; emails?: string[] };
      userDid?: string;
      serviceId?: string;
    }) => {
      const res = await api.post('/xrpc/io.exprsn.admin.certificates.issue', {
        ...data,
        domainId,
        issuerId: domainData?.intermediateCert?.id,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'certificates'] });
      toast.success('Certificate issued successfully');
      setActiveModal(null);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to issue certificate'),
  });

  // Revoke certificate
  const revokeMutation = useMutation({
    mutationFn: async ({ certId, reason }: { certId: string; reason?: string }) => {
      const res = await api.post('/xrpc/io.exprsn.admin.certificates.revoke', { certId, reason });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'certificates'] });
      toast.success('Certificate revoked');
    },
    onError: () => toast.error('Failed to revoke certificate'),
  });

  const domain = domainData?.domain;
  const intermediateCert = domainData?.intermediateCert;
  const certificates = certsData?.certificates || [];
  const hasRootCA = !!rootCAData;
  const hasIntermediateCA = !!intermediateCert;

  const getStatusBadge = (status: string, notAfter?: string) => {
    const isExpiring = notAfter && new Date(notAfter) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const isExpired = notAfter && new Date(notAfter) < new Date();

    if (status === 'revoked') return 'bg-red-500/10 text-red-400 border-red-500/30';
    if (isExpired) return 'bg-red-500/10 text-red-400 border-red-500/30';
    if (isExpiring) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
    return 'bg-green-500/10 text-green-400 border-green-500/30';
  };

  const getCertTypeIcon = (type: string) => {
    switch (type) {
      case 'server': return '🔒';
      case 'client': return '👤';
      case 'code_signing': return '📝';
      default: return '📜';
    }
  };

  const getCertTypeLabel = (type: string) => {
    switch (type) {
      case 'server': return 'TLS/Server';
      case 'client': return 'Client Auth';
      case 'code_signing': return 'Code Signing';
      default: return type;
    }
  };

  if (rootLoading || certsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Certificate Authority</h1>
          <p className="text-text-muted">{domain?.name || 'Loading...'} - PKI Management</p>
        </div>
        <div className="flex gap-2">
          {!hasRootCA && (
            <button
              onClick={() => setActiveModal('initRoot')}
              className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg transition-colors"
            >
              Initialize Root CA
            </button>
          )}
          {hasRootCA && !hasIntermediateCA && (
            <button
              onClick={() => setActiveModal('createIntermediate')}
              className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg transition-colors"
            >
              Create Intermediate CA
            </button>
          )}
          {hasIntermediateCA && (
            <button
              onClick={() => setActiveModal('issue')}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Issue Certificate
            </button>
          )}
        </div>
      </div>

      {/* CA Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Root CA Card */}
        <div className={`bg-surface border rounded-lg p-6 ${hasRootCA ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasRootCA ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
              <span className="text-xl">🏛️</span>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Root CA</h3>
              <p className="text-sm text-text-muted">
                {hasRootCA ? 'Exprsn Root Certificate Authority' : 'Not Initialized'}
              </p>
            </div>
          </div>
          {hasRootCA && rootCAData && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-text-muted">Serial</dt>
                <dd className="text-text-primary font-mono text-xs truncate">{rootCAData.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Fingerprint</dt>
                <dd className="text-text-primary font-mono text-xs truncate">{rootCAData.fingerprint?.slice(0, 20)}...</dd>
              </div>
              <div>
                <dt className="text-text-muted">Valid From</dt>
                <dd className="text-text-primary">{new Date(rootCAData.notBefore).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Valid Until</dt>
                <dd className="text-text-primary">{new Date(rootCAData.notAfter).toLocaleDateString()}</dd>
              </div>
            </dl>
          )}
          {!hasRootCA && (
            <p className="text-sm text-yellow-400">
              Root CA must be initialized before issuing certificates.
            </p>
          )}
        </div>

        {/* Intermediate CA Card */}
        <div className={`bg-surface border rounded-lg p-6 ${hasIntermediateCA ? 'border-green-500/30' : 'border-border'}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasIntermediateCA ? 'bg-green-500/10' : 'bg-surface-hover'}`}>
              <span className="text-xl">🔐</span>
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Intermediate CA</h3>
              <p className="text-sm text-text-muted">
                {hasIntermediateCA ? intermediateCert.commonName : 'Not Created'}
              </p>
            </div>
          </div>
          {hasIntermediateCA && intermediateCert && (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-text-muted">Serial</dt>
                <dd className="text-text-primary font-mono text-xs truncate">{intermediateCert.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Fingerprint</dt>
                <dd className="text-text-primary font-mono text-xs truncate">{intermediateCert.fingerprint?.slice(0, 20)}...</dd>
              </div>
              <div>
                <dt className="text-text-muted">Valid From</dt>
                <dd className="text-text-primary">{new Date(intermediateCert.notBefore).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Valid Until</dt>
                <dd className="text-text-primary">{new Date(intermediateCert.notAfter).toLocaleDateString()}</dd>
              </div>
            </dl>
          )}
          {!hasIntermediateCA && hasRootCA && (
            <p className="text-sm text-text-muted">
              Create an Intermediate CA to issue certificates for this domain.
            </p>
          )}
        </div>
      </div>

      {/* Certificate Type Summary */}
      {hasIntermediateCA && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { type: 'server', label: 'TLS/Server', icon: '🔒', desc: 'HTTPS & API endpoints' },
            { type: 'client', label: 'Client Auth', icon: '👤', desc: 'User authentication' },
            { type: 'code_signing', label: 'Code Signing', icon: '📝', desc: 'Sign releases & updates' },
          ].map(({ type, label, icon, desc }) => {
            const count = certificates.filter((c: Certificate) => c.certType === type).length;
            return (
              <button
                key={type}
                onClick={() => setFilterType(filterType === type ? 'all' : type)}
                className={`bg-surface border rounded-lg p-4 text-left transition-colors ${
                  filterType === type ? 'border-accent' : 'border-border hover:border-accent/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{icon}</span>
                  <span className="font-medium text-text-primary">{label}</span>
                </div>
                <p className="text-xs text-text-muted">{desc}</p>
                <p className="text-lg font-bold text-accent mt-2">{count}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Certificates Table */}
      {hasIntermediateCA && (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Issued Certificates</h2>
            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
          </div>
          {certificates.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">📜</div>
              <p className="text-text-muted">No certificates issued yet</p>
              <button
                onClick={() => setActiveModal('issue')}
                className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
              >
                Issue First Certificate
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Certificate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Expires</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {certificates.map((cert: Certificate) => (
                  <tr key={cert.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-text-primary font-medium">{cert.commonName}</p>
                        <p className="text-xs text-text-muted font-mono">{cert.serialNumber}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-surface-hover rounded text-sm">
                        <span>{getCertTypeIcon(cert.certType)}</span>
                        <span className="text-text-primary">{getCertTypeLabel(cert.certType)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(cert.status, cert.notAfter)}`}>
                        {cert.status === 'revoked' ? 'Revoked' : new Date(cert.notAfter) < new Date() ? 'Expired' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-text-muted text-sm">
                      {new Date(cert.notAfter).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedCert(cert);
                            setActiveModal('download');
                          }}
                          className="text-accent hover:text-accent-hover text-sm"
                        >
                          Download
                        </button>
                        {cert.status === 'active' && (
                          <button
                            onClick={() => {
                              if (confirm(`Revoke certificate "${cert.commonName}"?`)) {
                                revokeMutation.mutate({ certId: cert.id, reason: 'Administrative revocation' });
                              }
                            }}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      {activeModal === 'initRoot' && (
        <InitRootCAModal
          onClose={() => setActiveModal(null)}
          onSubmit={(data) => initRootMutation.mutate(data)}
          isLoading={initRootMutation.isPending}
        />
      )}
      {activeModal === 'createIntermediate' && (
        <CreateIntermediateModal
          domainName={domain?.name || ''}
          onClose={() => setActiveModal(null)}
          onSubmit={(data) => createIntermediateMutation.mutate(data)}
          isLoading={createIntermediateMutation.isPending}
        />
      )}
      {activeModal === 'issue' && (
        <IssueCertificateModal
          domainName={domain?.name || ''}
          onClose={() => setActiveModal(null)}
          onSubmit={(data) => issueMutation.mutate(data)}
          isLoading={issueMutation.isPending}
        />
      )}
      {activeModal === 'download' && selectedCert && (
        <DownloadCertificateModal
          cert={selectedCert}
          onClose={() => {
            setActiveModal(null);
            setSelectedCert(null);
          }}
        />
      )}
    </div>
  );
}

// Initialize Root CA Modal
function InitRootCAModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void;
  onSubmit: (data: { commonName: string; organization: string; validityDays: number }) => void;
  isLoading: boolean;
}) {
  const [commonName, setCommonName] = useState('Exprsn Root CA');
  const [organization, setOrganization] = useState('Exprsn');
  const [validityDays, setValidityDays] = useState(7300); // 20 years

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-2">Initialize Root CA</h2>
        <p className="text-sm text-text-muted mb-6">
          Create the root certificate authority for Exprsn PKI infrastructure.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Common Name</label>
            <input
              type="text"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Organization</label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Validity (days)</label>
            <input
              type="number"
              value={validityDays}
              onChange={(e) => setValidityDays(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">
              {Math.round(validityDays / 365)} years
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ commonName, organization, validityDays })}
            disabled={!commonName || isLoading}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Initializing...' : 'Initialize'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Create Intermediate CA Modal
function CreateIntermediateModal({
  domainName,
  onClose,
  onSubmit,
  isLoading,
}: {
  domainName: string;
  onClose: () => void;
  onSubmit: (data: { commonName: string; organization?: string; validityDays?: number }) => void;
  isLoading: boolean;
}) {
  const [commonName, setCommonName] = useState(`${domainName} Intermediate CA`);
  const [organization, setOrganization] = useState('Exprsn');
  const [validityDays, setValidityDays] = useState(3650); // 10 years

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-2">Create Intermediate CA</h2>
        <p className="text-sm text-text-muted mb-6">
          Create an intermediate certificate authority for issuing domain certificates.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Common Name</label>
            <input
              type="text"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Organization</label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Validity (days)</label>
            <input
              type="number"
              value={validityDays}
              onChange={(e) => setValidityDays(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">
              {Math.round(validityDays / 365)} years
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ commonName, organization, validityDays })}
            disabled={!commonName || isLoading}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Issue Certificate Modal
function IssueCertificateModal({
  domainName,
  onClose,
  onSubmit,
  isLoading,
}: {
  domainName: string;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [certType, setCertType] = useState<'client' | 'server' | 'code_signing'>('server');
  const [commonName, setCommonName] = useState('');
  const [organization, setOrganization] = useState('Exprsn');
  const [validityDays, setValidityDays] = useState(365);
  const [dnsNames, setDnsNames] = useState('');
  const [emails, setEmails] = useState('');
  const [userDid, setUserDid] = useState('');
  const [serviceId, setServiceId] = useState('');

  const certTypes = [
    { value: 'server', label: 'TLS/Server Certificate', icon: '🔒', desc: 'For HTTPS endpoints and API servers' },
    { value: 'client', label: 'Client Authentication', icon: '👤', desc: 'For user or service authentication' },
    { value: 'code_signing', label: 'Code Signing', icon: '📝', desc: 'For signing code and releases' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-lg my-8">
        <h2 className="text-xl font-bold text-text-primary mb-2">Issue Certificate</h2>
        <p className="text-sm text-text-muted mb-6">
          Issue a new certificate for {domainName}
        </p>

        <div className="space-y-4">
          {/* Certificate Type */}
          <div>
            <label className="block text-sm text-text-muted mb-2">Certificate Type</label>
            <div className="space-y-2">
              {certTypes.map((ct) => (
                <button
                  key={ct.value}
                  onClick={() => setCertType(ct.value as any)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    certType === ct.value
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{ct.icon}</span>
                    <span className="font-medium text-text-primary">{ct.label}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-1 ml-6">{ct.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Common Name */}
          <div>
            <label className="block text-sm text-text-muted mb-1">Common Name (CN)</label>
            <input
              type="text"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder={certType === 'server' ? 'api.exprsn.io' : certType === 'client' ? 'user@exprsn.io' : 'Exprsn Code Signing'}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>

          {/* Organization */}
          <div>
            <label className="block text-sm text-text-muted mb-1">Organization</label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>

          {/* Validity */}
          <div>
            <label className="block text-sm text-text-muted mb-1">Validity (days)</label>
            <select
              value={validityDays}
              onChange={(e) => setValidityDays(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              <option value={90}>90 days</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
              <option value={1095}>3 years</option>
            </select>
          </div>

          {/* DNS Names (for server certs) */}
          {certType === 'server' && (
            <div>
              <label className="block text-sm text-text-muted mb-1">DNS Names (SANs)</label>
              <input
                type="text"
                value={dnsNames}
                onChange={(e) => setDnsNames(e.target.value)}
                placeholder="*.exprsn.io, api.exprsn.io"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
              <p className="text-xs text-text-muted mt-1">Comma-separated list of DNS names</p>
            </div>
          )}

          {/* Email (for client certs) */}
          {certType === 'client' && (
            <>
              <div>
                <label className="block text-sm text-text-muted mb-1">Email Address</label>
                <input
                  type="email"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="user@exprsn.io"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">User DID (optional)</label>
                <input
                  type="text"
                  value={userDid}
                  onChange={(e) => setUserDid(e.target.value)}
                  placeholder="did:plc:..."
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </div>
            </>
          )}

          {/* Service ID (for server certs) */}
          {certType === 'server' && (
            <div>
              <label className="block text-sm text-text-muted mb-1">Service ID (optional)</label>
              <input
                type="text"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                placeholder="api-gateway, pds, relay..."
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => {
              const data: any = { certType, commonName, organization, validityDays };
              if (dnsNames) data.subjectAltNames = { dnsNames: dnsNames.split(',').map(s => s.trim()) };
              if (emails) data.subjectAltNames = { ...data.subjectAltNames, emails: emails.split(',').map(s => s.trim()) };
              if (userDid) data.userDid = userDid;
              if (serviceId) data.serviceId = serviceId;
              onSubmit(data);
            }}
            disabled={!commonName || isLoading}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {isLoading ? 'Issuing...' : 'Issue Certificate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Download Certificate Modal
function DownloadCertificateModal({
  cert,
  onClose,
}: {
  cert: Certificate;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<'pem' | 'der' | 'p12'>('pem');
  const [includeChain, setIncludeChain] = useState(true);

  const handleDownload = async () => {
    try {
      const params = new URLSearchParams({
        certId: cert.id,
        format,
        includeChain: includeChain.toString(),
      });
      const response = await api.get(`/xrpc/io.exprsn.admin.certificates.download?${params}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/x-pem-file' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cert.commonName.replace(/[^a-z0-9]/gi, '_')}.${format === 'pem' ? 'pem' : format === 'der' ? 'der' : 'p12'}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Certificate downloaded');
      onClose();
    } catch (error) {
      toast.error('Failed to download certificate');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-2">Download Certificate</h2>
        <p className="text-sm text-text-muted mb-6">{cert.commonName}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-2">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'pem', label: 'PEM', desc: 'Base64' },
                { value: 'der', label: 'DER', desc: 'Binary' },
                { value: 'p12', label: 'PKCS#12', desc: 'Bundle' },
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value as any)}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    format === f.value ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
                  }`}
                >
                  <p className="font-medium text-text-primary">{f.label}</p>
                  <p className="text-xs text-text-muted">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeChain}
              onChange={(e) => setIncludeChain(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent"
            />
            <span className="text-text-primary">Include certificate chain</span>
          </label>

          <div className="p-3 bg-surface-hover rounded-lg">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-text-muted">Type</dt>
                <dd className="text-text-primary">{cert.certType}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Status</dt>
                <dd className="text-text-primary">{cert.status}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Serial</dt>
                <dd className="text-text-primary font-mono text-xs truncate">{cert.serialNumber}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Expires</dt>
                <dd className="text-text-primary">{new Date(cert.notAfter).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
