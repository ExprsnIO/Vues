'use client';

import { useState } from 'react';
import { Badge, ConfirmDialog } from '@/components/admin/ui';

interface EmailDomain {
  id: string;
  domain: string;
  verified: boolean;
  verificationMethod?: 'dns' | 'email';
  verificationToken?: string;
  providerId?: string;
  providerName?: string;
  autoEnroll: boolean;
  createdAt: string;
}

interface EmailDomainListProps {
  domains: EmailDomain[];
  onAdd: (domain: string, autoEnroll: boolean) => void;
  onRemove: (id: string) => void;
  onVerify: (id: string) => void;
  onToggleAutoEnroll: (id: string, enabled: boolean) => void;
  isAdding?: boolean;
  isVerifying?: string;
}

export function EmailDomainList({
  domains,
  onAdd,
  onRemove,
  onVerify,
  onToggleAutoEnroll,
  isAdding,
  isVerifying,
}: EmailDomainListProps) {
  const [newDomain, setNewDomain] = useState('');
  const [autoEnroll, setAutoEnroll] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<EmailDomain | null>(null);
  const [showVerification, setShowVerification] = useState<string | null>(null);

  const handleAdd = () => {
    if (newDomain && !domains.some(d => d.domain === newDomain)) {
      onAdd(newDomain, autoEnroll);
      setNewDomain('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Add Domain */}
      <div className="p-4 bg-surface-hover rounded-lg">
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value.toLowerCase())}
              placeholder="Enter domain (e.g., company.com)"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newDomain || isAdding}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : 'Add Domain'}
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3">
          <input
            type="checkbox"
            checked={autoEnroll}
            onChange={(e) => setAutoEnroll(e.target.checked)}
            className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-sm text-text-muted">Auto-enroll users with this email domain</span>
        </label>
      </div>

      {/* Domain List */}
      <div className="space-y-2">
        {domains.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <p>No email domains configured</p>
            <p className="text-sm mt-1">Add domains to restrict SSO access</p>
          </div>
        ) : (
          domains.map((domain) => (
            <div
              key={domain.id}
              className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${domain.verified ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                  {domain.verified ? (
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{domain.domain}</p>
                    <Badge variant={domain.verified ? 'success' : 'warning'} size="sm">
                      {domain.verified ? 'Verified' : 'Pending'}
                    </Badge>
                    {domain.autoEnroll && (
                      <Badge variant="info" size="sm">Auto-enroll</Badge>
                    )}
                  </div>
                  {domain.providerName && (
                    <p className="text-xs text-text-muted">Linked to {domain.providerName}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!domain.verified && (
                  <button
                    onClick={() => setShowVerification(domain.id)}
                    className="px-3 py-1.5 text-sm text-accent hover:bg-accent/10 rounded-lg transition-colors"
                  >
                    Verify
                  </button>
                )}
                <button
                  onClick={() => onToggleAutoEnroll(domain.id, !domain.autoEnroll)}
                  className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  {domain.autoEnroll ? 'Disable Auto-enroll' : 'Enable Auto-enroll'}
                </button>
                <button
                  onClick={() => setRemoveTarget(domain)}
                  className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Verification Modal */}
      {showVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface border border-border rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Verify Domain</h3>

            {(() => {
              const domain = domains.find(d => d.id === showVerification);
              if (!domain) return null;

              return (
                <div className="space-y-4">
                  <p className="text-sm text-text-muted">
                    To verify <strong>{domain.domain}</strong>, add this TXT record to your DNS:
                  </p>

                  <div className="p-4 bg-surface-hover rounded-lg">
                    <p className="text-xs text-text-muted mb-1">TXT Record</p>
                    <div className="flex items-center justify-between">
                      <code className="text-sm font-mono text-text-primary">
                        _exprsn-verify={domain.verificationToken || 'loading...'}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(`_exprsn-verify=${domain.verificationToken}`)}
                        className="p-1.5 hover:bg-surface rounded transition-colors"
                      >
                        <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-text-muted">
                    DNS changes may take up to 48 hours to propagate.
                  </p>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowVerification(null)}
                      className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        onVerify(domain.id);
                        setShowVerification(null);
                      }}
                      disabled={isVerifying === domain.id}
                      className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isVerifying === domain.id ? 'Checking...' : 'Check DNS'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Remove Confirmation */}
      <ConfirmDialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) {
            onRemove(removeTarget.id);
            setRemoveTarget(null);
          }
        }}
        title="Remove Domain?"
        message={`Are you sure you want to remove ${removeTarget?.domain}? Users with this email domain will no longer be able to use SSO.`}
        confirmLabel="Remove"
        variant="danger"
      />
    </div>
  );
}

export default EmailDomainList;
