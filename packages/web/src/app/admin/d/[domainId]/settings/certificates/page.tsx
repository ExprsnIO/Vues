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
  type: 'tls' | 'intermediate' | 'entity';
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  status: 'valid' | 'expiring' | 'expired';
}

export default function DomainCertificatesPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();
  const [showIssueModal, setShowIssueModal] = useState(false);

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: certsData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'certificates'],
    queryFn: () => api.adminDomainCertificatesList(domainId),
    enabled: !!domainId,
  });

  const revokeMutation = useMutation({
    mutationFn: (certId: string) => api.adminDomainCertificatesRevoke(domainId, certId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'certificates'] });
      toast.success('Certificate revoked');
    },
    onError: () => toast.error('Failed to revoke certificate'),
  });

  const domain = domainData?.domain;
  const certificates = certsData?.certificates || [];
  const intermediateCert = domainData?.intermediateCert;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'expiring': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'expired': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Certificates</h1>
          <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
        </div>
        <button
          onClick={() => setShowIssueModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Issue Certificate
        </button>
      </div>

      {/* Intermediate Certificate */}
      {intermediateCert && (
        <div className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Intermediate Certificate</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-text-muted text-sm">Subject</dt>
              <dd className="text-text-primary font-mono text-sm">{intermediateCert.subject}</dd>
            </div>
            <div>
              <dt className="text-text-muted text-sm">Issuer</dt>
              <dd className="text-text-primary font-mono text-sm">{intermediateCert.issuer}</dd>
            </div>
            <div>
              <dt className="text-text-muted text-sm">Valid From</dt>
              <dd className="text-text-primary">{new Date(intermediateCert.validFrom).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-text-muted text-sm">Valid Until</dt>
              <dd className="text-text-primary">{new Date(intermediateCert.validTo).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Entity Certificates */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Entity Certificates</h2>
        </div>
        {certificates.length === 0 ? (
          <div className="p-6 text-center text-text-muted">No certificates issued</div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Expires</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-4">
                    <p className="text-text-primary font-mono text-sm">{cert.subject}</p>
                  </td>
                  <td className="px-4 py-4 text-text-muted capitalize">{cert.type}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(cert.status)}`}>
                      {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-text-muted text-sm">
                    {new Date(cert.validTo).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      onClick={() => {
                        if (confirm('Revoke this certificate?')) revokeMutation.mutate(cert.id);
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showIssueModal && (
        <IssueCertificateModal domainId={domainId} onClose={() => setShowIssueModal(false)} />
      )}
    </div>
  );
}

function IssueCertificateModal({ domainId, onClose }: { domainId: string; onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [type, setType] = useState<'tls' | 'entity'>('entity');
  const queryClient = useQueryClient();

  const issueMutation = useMutation({
    mutationFn: (data: { domainId: string; subject: string; type: string }) =>
      api.adminDomainCertificatesIssue(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'certificates'] });
      toast.success('Certificate issued');
      onClose();
    },
    onError: () => toast.error('Failed to issue certificate'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Issue Certificate</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'tls' | 'entity')}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              <option value="entity">Entity Certificate</option>
              <option value="tls">TLS Certificate</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="CN=..."
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => issueMutation.mutate({ domainId, subject, type })}
            disabled={!subject || issueMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {issueMutation.isPending ? 'Issuing...' : 'Issue'}
          </button>
        </div>
      </div>
    </div>
  );
}
