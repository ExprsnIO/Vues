'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface IssueCertificateModalProps {
  domainId: string;
  domain: string;
  intermediateCertId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type CertType = 'client' | 'server' | 'code_signing';

const VALIDITY_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
  { value: 730, label: '2 years' },
];

export function IssueCertificateModal({
  domainId,
  domain,
  intermediateCertId,
  isOpen,
  onClose,
  onSuccess,
}: IssueCertificateModalProps) {
  const [certType, setCertType] = useState<CertType>('client');
  const [commonName, setCommonName] = useState('');
  const [organization, setOrganization] = useState('');
  const [validityDays, setValidityDays] = useState(365);

  // For server certs - SANs
  const [dnsNames, setDnsNames] = useState<string[]>([]);
  const [newDnsName, setNewDnsName] = useState('');

  // For client certs
  const [userDid, setUserDid] = useState('');

  // For server certs
  const [serviceId, setServiceId] = useState('');

  const issueMutation = useMutation({
    mutationFn: () =>
      api.adminCertificatesIssue({
        issuerId: intermediateCertId,
        domainId,
        certType,
        commonName,
        organization: organization || undefined,
        validityDays,
        subjectAltNames: certType === 'server' ? { dnsNames } : undefined,
        userDid: certType === 'client' ? userDid || undefined : undefined,
        serviceId: certType === 'server' ? serviceId || undefined : undefined,
      }),
    onSuccess: () => {
      toast.success('Certificate issued successfully');
      onSuccess();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to issue certificate');
    },
  });

  const handleClose = useCallback(() => {
    setCertType('client');
    setCommonName('');
    setOrganization('');
    setValidityDays(365);
    setDnsNames([]);
    setNewDnsName('');
    setUserDid('');
    setServiceId('');
    onClose();
  }, [onClose]);

  const addDnsName = () => {
    if (newDnsName.trim() && !dnsNames.includes(newDnsName.trim())) {
      setDnsNames([...dnsNames, newDnsName.trim()]);
      setNewDnsName('');
    }
  };

  const removeDnsName = (name: string) => {
    setDnsNames(dnsNames.filter((n) => n !== name));
  };

  const handleSubmit = () => {
    if (!commonName.trim()) {
      toast.error('Common Name is required');
      return;
    }
    if (certType === 'server' && dnsNames.length === 0) {
      toast.error('At least one DNS name is required for server certificates');
      return;
    }
    issueMutation.mutate();
  };

  // Auto-populate common name based on cert type
  const handleCertTypeChange = (type: CertType) => {
    setCertType(type);
    if (type === 'server' && !commonName) {
      setCommonName(domain);
      setDnsNames([domain, `*.${domain}`]);
    } else if (type === 'code_signing' && !commonName) {
      setCommonName(`${domain} Code Signing`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">Issue Certificate</h2>
          <p className="text-sm text-text-muted mt-1">Issue a new entity certificate</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Certificate Type */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Certificate Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['client', 'server', 'code_signing'] as CertType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleCertTypeChange(type)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    certType === type
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-surface border-border text-text-muted hover:border-accent/50'
                  }`}
                >
                  {type === 'client' && 'Client'}
                  {type === 'server' && 'Server'}
                  {type === 'code_signing' && 'Code Signing'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {certType === 'client' && 'For authenticating users and applications'}
              {certType === 'server' && 'For TLS/SSL on servers and services'}
              {certType === 'code_signing' && 'For signing code and packages'}
            </p>
          </div>

          {/* Common Name */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Common Name (CN) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder={
                certType === 'server' ? domain :
                certType === 'code_signing' ? `${domain} Code Signing` :
                'user@example.com'
              }
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Organization */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Organization (O)
            </label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="Organization name"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Server cert specific: DNS Names (SANs) */}
          {certType === 'server' && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">
                Subject Alternative Names (SANs) <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newDnsName}
                  onChange={(e) => setNewDnsName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDnsName())}
                  placeholder="example.com"
                  className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={addDnsName}
                  className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
              {dnsNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {dnsNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded text-sm text-text-primary"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeDnsName(name)}
                        className="text-text-muted hover:text-red-500"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Client cert specific: User DID */}
          {certType === 'client' && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">
                User DID (Optional)
              </label>
              <input
                type="text"
                value={userDid}
                onChange={(e) => setUserDid(e.target.value)}
                placeholder="did:plc:..."
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
              />
              <p className="mt-1 text-xs text-text-muted">
                Link this certificate to a specific user identity
              </p>
            </div>
          )}

          {/* Server cert specific: Service ID */}
          {certType === 'server' && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">
                Service ID (Optional)
              </label>
              <input
                type="text"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                placeholder="pds, relay, appview..."
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}

          {/* Validity Period */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Validity Period
            </label>
            <select
              value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {VALIDITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!commonName.trim() || issueMutation.isPending}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {issueMutation.isPending ? 'Issuing...' : 'Issue Certificate'}
          </button>
        </div>
      </div>
    </div>
  );
}
