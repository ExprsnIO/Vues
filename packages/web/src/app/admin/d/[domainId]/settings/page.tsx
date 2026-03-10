'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

export default function DomainSettingsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransferHistory, setShowTransferHistory] = useState(false);

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  // Fetch pending transfers for this domain
  const { data: pendingTransfers } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'transfers', 'pending'],
    queryFn: () => api.adminDomainTransferPending({ domainId }),
    enabled: !!domainId,
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.adminDomainsVerify(domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Domain verified');
    },
    onError: () => toast.error('Failed to verify domain'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const domain = data?.domain;
  if (!domain) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'pending':
      case 'verifying': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'suspended': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  const settingsLinks = [
    { href: `/admin/d/${domainId}/settings/services`, label: 'Services & Features', description: 'Configure available services and features' },
    { href: `/admin/d/${domainId}/settings/identity`, label: 'Identity (PLC)', description: 'Manage PLC and identity settings' },
    { href: `/admin/d/${domainId}/settings/sso`, label: 'SSO', description: 'Single sign-on configuration' },
    { href: `/admin/d/${domainId}/settings/certificates`, label: 'Certificates', description: 'TLS and code signing certificates' },
    { href: `/admin/d/${domainId}/settings/branding`, label: 'Branding', description: 'Customize domain appearance' },
    { href: `/admin/d/${domainId}/settings/federation`, label: 'Federation', description: 'AT Protocol federation settings', show: domain.type === 'federated' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Domain Settings</h1>
        <p className="text-text-muted">{domain.name}</p>
      </div>

      {/* Domain Overview */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold text-text-primary">{domain.domain}</h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(domain.status)}`}>
                {domain.status.charAt(0).toUpperCase() + domain.status.slice(1)}
              </span>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-text-muted">Type</dt>
                <dd className="text-text-primary capitalize">{domain.type}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Handle Suffix</dt>
                <dd className="text-text-primary">{domain.handleSuffix || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Created</dt>
                <dd className="text-text-primary">{new Date(domain.createdAt).toLocaleDateString()}</dd>
              </div>
              {domain.verifiedAt && (
                <div>
                  <dt className="text-text-muted">Verified</dt>
                  <dd className="text-text-primary">{new Date(domain.verifiedAt).toLocaleDateString()}</dd>
                </div>
              )}
            </dl>
          </div>
          {domain.status === 'pending' && (
            <button
              onClick={() => verifyMutation.mutate()}
              disabled={verifyMutation.isPending}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
            >
              Verify Domain
            </button>
          )}
        </div>
      </div>

      {/* Settings Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsLinks
          .filter(link => link.show !== false)
          .map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-surface border border-border rounded-lg p-6 hover:border-accent transition-colors"
            >
              <h3 className="text-lg font-semibold text-text-primary">{link.label}</h3>
              <p className="text-text-muted text-sm mt-1">{link.description}</p>
            </Link>
          ))}
      </div>

      {/* Domain Transfer */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Domain Transfer</h2>
            <p className="text-text-muted text-sm mt-1">Transfer domain ownership to another organization or make it independent</p>
          </div>
          <button
            onClick={() => setShowTransferHistory(!showTransferHistory)}
            className="px-3 py-1.5 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm"
          >
            {showTransferHistory ? 'Hide History' : 'View History'}
          </button>
        </div>

        {/* Pending Transfers */}
        {pendingTransfers && pendingTransfers.transfers.length > 0 && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">Pending Transfer</h3>
            {pendingTransfers.transfers.map((transfer: any) => (
              <div key={transfer.id} className="space-y-2">
                <p className="text-sm text-text-primary">
                  {transfer.targetOrganization ? (
                    <>Transfer to <span className="font-semibold">{transfer.targetOrganization.displayName || transfer.targetOrganization.name}</span></>
                  ) : (
                    'Making domain independent'
                  )}
                </p>
                <p className="text-xs text-text-muted">
                  Initiated {new Date(transfer.initiatedAt).toLocaleString()}
                </p>
                {transfer.reason && (
                  <p className="text-xs text-text-muted">Reason: {transfer.reason}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <TransferActionButtons transfer={transfer} domainId={domainId} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Transfer History (toggle) */}
        {showTransferHistory && (
          <div className="mb-4">
            <TransferHistory domainId={domainId} />
          </div>
        )}

        <button
          onClick={() => setShowTransferModal(true)}
          disabled={pendingTransfers && pendingTransfers.transfers.length > 0}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Initiate Transfer
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium">Suspend Domain</p>
              <p className="text-text-muted text-sm">Temporarily disable this domain</p>
            </div>
            <button className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg">
              Suspend
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium">Delete Domain</p>
              <p className="text-text-muted text-sm">Permanently delete this domain and all its data</p>
            </div>
            <button className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg">
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransferModal && (
        <TransferModal
          domainId={domainId}
          domainName={domain.name}
          onClose={() => setShowTransferModal(false)}
        />
      )}
    </div>
  );
}

// Transfer Action Buttons Component
function TransferActionButtons({ transfer, domainId }: { transfer: any; domainId: string }) {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => api.adminDomainTransferApprove({ transferId: transfer.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer approved and completed');
    },
    onError: () => toast.error('Failed to approve transfer'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.adminDomainTransferReject({ transferId: transfer.id, reason: 'Rejected by admin' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer rejected');
    },
    onError: () => toast.error('Failed to reject transfer'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.adminDomainTransferCancel({ transferId: transfer.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer cancelled');
    },
    onError: () => toast.error('Failed to cancel transfer'),
  });

  return (
    <>
      <button
        onClick={() => approveMutation.mutate()}
        disabled={approveMutation.isPending}
        className="px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded text-sm"
      >
        Approve
      </button>
      <button
        onClick={() => rejectMutation.mutate()}
        disabled={rejectMutation.isPending}
        className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-sm"
      >
        Reject
      </button>
      <button
        onClick={() => cancelMutation.mutate()}
        disabled={cancelMutation.isPending}
        className="px-3 py-1 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded text-sm"
      >
        Cancel
      </button>
    </>
  );
}

// Transfer History Component
function TransferHistory({ domainId }: { domainId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'transfers', 'history'],
    queryFn: () => api.adminDomainTransferHistory({ domainId, limit: 10 }),
  });

  if (isLoading) {
    return <div className="text-text-muted text-sm">Loading history...</div>;
  }

  if (!data || data.transfers.length === 0) {
    return <div className="text-text-muted text-sm">No transfer history</div>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary">Transfer History</h3>
      <div className="space-y-2">
        {data.transfers.map((transfer: any) => (
          <div key={transfer.id} className="p-3 bg-surface-hover rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-text-primary">
                  {transfer.status === 'completed' ? 'Transferred to' : 'Transfer to'}{' '}
                  {transfer.targetOrganization ? (
                    <span className="font-semibold">{transfer.targetOrganization.displayName || transfer.targetOrganization.name}</span>
                  ) : (
                    'Independent'
                  )}
                </span>
                <span
                  className={`ml-2 px-2 py-0.5 rounded text-xs ${
                    transfer.status === 'completed'
                      ? 'bg-green-500/10 text-green-400'
                      : transfer.status === 'rejected'
                      ? 'bg-red-500/10 text-red-400'
                      : transfer.status === 'cancelled'
                      ? 'bg-gray-500/10 text-gray-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}
                >
                  {transfer.status}
                </span>
              </div>
              <span className="text-text-muted text-xs">
                {new Date(transfer.initiatedAt).toLocaleDateString()}
              </span>
            </div>
            {transfer.reason && (
              <p className="text-text-muted text-xs mt-1">{transfer.reason}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Transfer Modal Component
function TransferModal({
  domainId,
  domainName,
  onClose,
}: {
  domainId: string;
  domainName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetOrganizationId, setTargetOrganizationId] = useState('');
  const [makeIndependent, setMakeIndependent] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch organizations for dropdown
  const { data: orgsData } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: () => api.getOrganizations({ limit: 100 }),
  });

  const initiateMutation = useMutation({
    mutationFn: () =>
      api.adminDomainTransferInitiate({
        domainId,
        targetOrganizationId: makeIndependent ? null : targetOrganizationId || null,
        reason: reason || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer initiated');
      onClose();
    },
    onError: () => toast.error('Failed to initiate transfer'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!makeIndependent && !targetOrganizationId) {
      toast.error('Please select a target organization or make domain independent');
      return;
    }
    initiateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-6 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-text-primary mb-4">Initiate Domain Transfer</h2>
        <p className="text-text-muted text-sm mb-6">
          Transfer ownership of <span className="font-semibold">{domainName}</span> to another organization or make it independent.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              id="makeIndependent"
              checked={makeIndependent}
              onChange={(e) => {
                setMakeIndependent(e.target.checked);
                if (e.target.checked) setTargetOrganizationId('');
              }}
              className="w-4 h-4"
            />
            <label htmlFor="makeIndependent" className="text-sm text-text-primary">
              Make domain independent (no organization owner)
            </label>
          </div>

          {!makeIndependent && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Target Organization
              </label>
              <select
                value={targetOrganizationId}
                onChange={(e) => setTargetOrganizationId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                required={!makeIndependent}
              >
                <option value="">Select organization...</option>
                {orgsData?.organizations.map((org: any) => (
                  <option key={org.id} value={org.id}>
                    {org.displayName || org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this transfer being initiated?"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={initiateMutation.isPending}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
            >
              {initiateMutation.isPending ? 'Initiating...' : 'Initiate Transfer'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
