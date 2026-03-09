// @ts-nocheck
'use client';

import { useState } from 'react';
import { Modal, ModalBody, ModalFooter, Badge } from '@/components/admin/ui';

interface RevokeConfirmationProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
  certificate: {
    id: string;
    subject: string;
    type: string;
    serialNumber: string;
    notAfter: string;
    childCount?: number;
  };
}

const REVOCATION_REASONS = [
  { value: 'unspecified', label: 'Unspecified', description: 'No specific reason provided' },
  { value: 'keyCompromise', label: 'Key Compromise', description: 'The private key has been compromised' },
  { value: 'caCompromise', label: 'CA Compromise', description: 'The issuing CA has been compromised' },
  { value: 'affiliationChanged', label: 'Affiliation Changed', description: 'The subject\'s affiliation has changed' },
  { value: 'superseded', label: 'Superseded', description: 'A new certificate has been issued' },
  { value: 'cessationOfOperation', label: 'Cessation of Operation', description: 'The certificate is no longer needed' },
  { value: 'certificateHold', label: 'Certificate Hold', description: 'Temporarily suspend the certificate' },
];

export function RevokeConfirmation({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  certificate,
}: RevokeConfirmationProps) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const isCA = certificate.type === 'root' || certificate.type === 'intermediate';
  const hasChildren = certificate.childCount && certificate.childCount > 0;

  const handleConfirm = () => {
    if (reason) {
      onConfirm(reason);
    }
  };

  const handleClose = () => {
    setReason('');
    setConfirmed(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Revoke Certificate"
      size="md"
    >
      <ModalBody className="space-y-4">
        {/* Warning Banner */}
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-500">This action cannot be undone</p>
              <p className="text-xs text-text-muted mt-1">
                Revoking this certificate will immediately invalidate it and add it to the CRL.
              </p>
            </div>
          </div>
        </div>

        {/* CA Warning */}
        {isCA && hasChildren && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-500">CA Certificate with issued certificates</p>
                <p className="text-xs text-text-muted mt-1">
                  This CA has issued <strong>{certificate.childCount}</strong> certificate(s).
                  Revoking it will invalidate the entire certificate chain.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Certificate Info */}
        <div className="p-4 bg-surface-hover rounded-lg">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">Subject</span>
              <span className="text-sm font-medium text-text-primary">{certificate.subject}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">Type</span>
              <Badge variant="default">{certificate.type}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">Serial Number</span>
              <span className="text-xs font-mono text-text-primary">{certificate.serialNumber.slice(0, 20)}...</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">Expires</span>
              <span className="text-sm text-text-primary">{new Date(certificate.notAfter).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Revocation Reason */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Revocation Reason <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {REVOCATION_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`w-full p-3 rounded-lg border text-left transition-all ${
                  reason === r.value
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <p className="text-sm font-medium text-text-primary">{r.label}</p>
                <p className="text-xs text-text-muted mt-0.5">{r.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Confirmation Checkbox */}
        {isCA && hasChildren && (
          <label className="flex items-start gap-3 p-3 bg-surface-hover rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-sm text-text-primary">
              I understand that revoking this CA will invalidate all {certificate.childCount} certificates
              issued by it and this action cannot be undone.
            </span>
          </label>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          onClick={handleClose}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading || !reason || (isCA && hasChildren && !confirmed)}
          className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Revoking...' : 'Revoke Certificate'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

export default RevokeConfirmation;
