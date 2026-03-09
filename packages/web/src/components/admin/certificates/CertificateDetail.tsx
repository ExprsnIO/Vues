'use client';

import { useState } from 'react';
import { Badge, StatusIndicator, Modal, ModalBody, ModalFooter } from '@/components/admin/ui';

interface CertificateDetailProps {
  certificate: {
    id: string;
    subject: string;
    subjectAltNames?: string[];
    type: 'root' | 'intermediate' | 'leaf' | 'client' | 'server';
    status: 'active' | 'revoked' | 'expired' | 'pending';
    serialNumber: string;
    notBefore: string;
    notAfter: string;
    issuer?: string;
    issuerCertId?: string;
    keyUsage?: string[];
    extKeyUsage?: string[];
    algorithm: string;
    keySize: number;
    fingerprint: {
      sha1: string;
      sha256: string;
    };
    pem?: string;
    revokedAt?: string;
    revocationReason?: string;
  };
  onRevoke?: (id: string, reason: string) => void;
  onRenew?: (id: string) => void;
  onDownload?: (id: string, format: 'pem' | 'der' | 'p12') => void;
  onViewIssuer?: (id: string) => void;
  isRevoking?: boolean;
  isRenewing?: boolean;
}

export function CertificateDetail({
  certificate,
  onRevoke,
  onRenew,
  onDownload,
  onViewIssuer,
  isRevoking,
  isRenewing,
}: CertificateDetailProps) {
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revocationReason, setRevocationReason] = useState('');
  const [showPem, setShowPem] = useState(false);

  const daysUntilExpiry = Math.ceil(
    (new Date(certificate.notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const statusColors = {
    active: 'success' as const,
    revoked: 'error' as const,
    expired: 'warning' as const,
    pending: 'info' as const,
  };

  const typeLabels = {
    root: 'Root CA',
    intermediate: 'Intermediate CA',
    leaf: 'End Entity',
    client: 'Client Certificate',
    server: 'Server Certificate',
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-text-primary">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );

  const Field = ({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) => (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-text-muted flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm text-text-primary text-right ${mono ? 'font-mono' : ''}`}>
          {value}
        </span>
        {copyable && (
          <button
            onClick={() => navigator.clipboard.writeText(value)}
            className="p-1 hover:bg-surface-hover rounded transition-colors"
            title="Copy to clipboard"
          >
            <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-text-primary">{certificate.subject}</h3>
            <Badge variant={statusColors[certificate.status]}>{certificate.status}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Badge variant="default">{typeLabels[certificate.type]}</Badge>
            <span>•</span>
            <span>{certificate.algorithm} {certificate.keySize}-bit</span>
          </div>
        </div>
        <StatusIndicator
          status={certificate.status === 'active' ? 'online' : certificate.status === 'revoked' ? 'error' : 'warning'}
          size="lg"
        />
      </div>

      {/* Expiration Warning */}
      {certificate.status === 'active' && daysUntilExpiry < 90 && (
        <div className={`p-4 rounded-lg border ${
          daysUntilExpiry < 30 ? 'bg-red-500/10 border-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20'
        }`}>
          <div className="flex items-center gap-3">
            <svg className={`w-5 h-5 ${daysUntilExpiry < 30 ? 'text-red-500' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className={`text-sm font-medium ${daysUntilExpiry < 30 ? 'text-red-500' : 'text-yellow-500'}`}>
                Certificate expires in {daysUntilExpiry} days
              </p>
              <p className="text-xs text-text-muted mt-1">
                Consider renewing this certificate before it expires.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Revocation Info */}
      {certificate.status === 'revoked' && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-500">Certificate Revoked</p>
              {certificate.revokedAt && (
                <p className="text-xs text-text-muted mt-1">
                  Revoked on {new Date(certificate.revokedAt).toLocaleString()}
                  {certificate.revocationReason && ` - ${certificate.revocationReason}`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Details */}
      <div className="grid gap-6">
        <Section title="Certificate Information">
          <Field label="Serial Number" value={certificate.serialNumber} mono copyable />
          <Field label="Valid From" value={new Date(certificate.notBefore).toLocaleString()} />
          <Field label="Valid Until" value={new Date(certificate.notAfter).toLocaleString()} />
          {certificate.issuer && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">Issuer</span>
              <button
                onClick={() => certificate.issuerCertId && onViewIssuer?.(certificate.issuerCertId)}
                className="text-sm text-accent hover:underline"
              >
                {certificate.issuer}
              </button>
            </div>
          )}
        </Section>

        {certificate.subjectAltNames && certificate.subjectAltNames.length > 0 && (
          <Section title="Subject Alternative Names">
            <div className="flex flex-wrap gap-2">
              {certificate.subjectAltNames.map((san, i) => (
                <span key={i} className="px-2 py-1 text-xs bg-surface-hover text-text-primary rounded font-mono">
                  {san}
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Key Usage">
          {certificate.keyUsage && certificate.keyUsage.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-2">Key Usage</p>
              <div className="flex flex-wrap gap-2">
                {certificate.keyUsage.map((usage, i) => (
                  <Badge key={i} variant="default" size="sm">{usage}</Badge>
                ))}
              </div>
            </div>
          )}
          {certificate.extKeyUsage && certificate.extKeyUsage.length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-2">Extended Key Usage</p>
              <div className="flex flex-wrap gap-2">
                {certificate.extKeyUsage.map((usage, i) => (
                  <Badge key={i} variant="info" size="sm">{usage}</Badge>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="Fingerprints">
          <div className="space-y-2">
            <div>
              <p className="text-xs text-text-muted mb-1">SHA-1</p>
              <p className="text-xs font-mono text-text-primary break-all bg-surface-hover p-2 rounded">
                {certificate.fingerprint.sha1}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1">SHA-256</p>
              <p className="text-xs font-mono text-text-primary break-all bg-surface-hover p-2 rounded">
                {certificate.fingerprint.sha256}
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* PEM View */}
      {certificate.pem && (
        <div>
          <button
            onClick={() => setShowPem(!showPem)}
            className="flex items-center gap-2 text-sm text-accent hover:underline"
          >
            <svg className={`w-4 h-4 transition-transform ${showPem ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showPem ? 'Hide' : 'Show'} PEM
          </button>
          {showPem && (
            <pre className="mt-2 p-4 bg-surface-hover rounded-lg text-xs font-mono text-text-primary overflow-x-auto">
              {certificate.pem}
            </pre>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
        {onDownload && (
          <div className="flex gap-2">
            <button
              onClick={() => onDownload(certificate.id, 'pem')}
              className="px-3 py-2 text-sm bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors"
            >
              Download PEM
            </button>
            <button
              onClick={() => onDownload(certificate.id, 'der')}
              className="px-3 py-2 text-sm bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors"
            >
              Download DER
            </button>
          </div>
        )}
        {certificate.status === 'active' && onRenew && (
          <button
            onClick={() => onRenew(certificate.id)}
            disabled={isRenewing}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isRenewing ? 'Renewing...' : 'Renew Certificate'}
          </button>
        )}
        {certificate.status === 'active' && onRevoke && (
          <button
            onClick={() => setShowRevokeModal(true)}
            className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Revoke Certificate
          </button>
        )}
      </div>

      {/* Revoke Modal */}
      <Modal
        isOpen={showRevokeModal}
        onClose={() => setShowRevokeModal(false)}
        title="Revoke Certificate"
        size="md"
      >
        <ModalBody>
          <p className="text-sm text-text-muted mb-4">
            Are you sure you want to revoke this certificate? This action cannot be undone.
          </p>
          <div className="p-3 bg-surface-hover rounded-lg mb-4">
            <p className="text-sm font-medium text-text-primary">{certificate.subject}</p>
            <p className="text-xs text-text-muted mt-1">SN: {certificate.serialNumber}</p>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-text-primary">Revocation Reason</span>
            <select
              value={revocationReason}
              onChange={(e) => setRevocationReason(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Select a reason...</option>
              <option value="unspecified">Unspecified</option>
              <option value="keyCompromise">Key Compromise</option>
              <option value="caCompromise">CA Compromise</option>
              <option value="affiliationChanged">Affiliation Changed</option>
              <option value="superseded">Superseded</option>
              <option value="cessationOfOperation">Cessation of Operation</option>
              <option value="certificateHold">Certificate Hold</option>
            </select>
          </label>
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => setShowRevokeModal(false)}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onRevoke?.(certificate.id, revocationReason);
              setShowRevokeModal(false);
            }}
            disabled={isRevoking || !revocationReason}
            className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isRevoking ? 'Revoking...' : 'Revoke Certificate'}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default CertificateDetail;
