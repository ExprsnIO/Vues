'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type Tab = 'identities' | 'handles' | 'config' | 'audit';

interface PlcIdentity {
  did: string;
  handle: string | null;
  pdsEndpoint: string | null;
  signingKey: string | null;
  rotationKeys: string[];
  createdAt: string;
  updatedAt: string;
}

interface HandleReservation {
  id: number;
  handle: string;
  handleType: 'user' | 'org';
  organizationId: string | null;
  reservedBy: string | null;
  reservedAt: string;
  expiresAt: string | null;
  status: 'active' | 'claimed' | 'expired' | 'released';
}

interface PlcConfig {
  enabled: boolean;
  mode: 'standalone' | 'external';
  externalPlcUrl: string | null;
  defaultPdsEndpoint: string;
  allowedHandleDomains: string[];
  reservedHandles: string[];
}

interface AuditEntry {
  id: number;
  did: string;
  action: string;
  operationCid: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function PlcAdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('identities');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">PLC Directory</h1>
        <p className="text-text-muted text-sm mt-1">
          Manage DID identities, handle reservations, and PLC configuration
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border pb-px">
        {[
          { id: 'identities' as Tab, label: 'Identities' },
          { id: 'handles' as Tab, label: 'Handle Reservations' },
          { id: 'config' as Tab, label: 'Configuration' },
          { id: 'audit' as Tab, label: 'Audit Log' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-accent'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'identities' && <IdentitiesTab />}
      {activeTab === 'handles' && <HandlesTab />}
      {activeTab === 'config' && <ConfigTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  );
}

// ============================================================================
// Identities Tab
// ============================================================================

function IdentitiesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState<PlcIdentity | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plc', 'identities', search],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.listIdentities?search=${encodeURIComponent(search)}&limit=50`, {
        headers: { 'X-Dev-Admin': 'true' },
      });
      return response.json();
    },
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin', 'plc', 'stats'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.getStats`, {
        headers: { 'X-Dev-Admin': 'true' },
      });
      return response.json();
    },
  });

  const identities: PlcIdentity[] = data?.identities || [];
  const stats = statsData || { totalIdentities: 0, totalOperations: 0, identitiesThisMonth: 0 };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-text-primary">{stats.totalIdentities}</p>
          <p className="text-sm text-text-muted">Total Identities</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-text-primary">{stats.totalOperations}</p>
          <p className="text-sm text-text-muted">Total Operations</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-accent">{stats.identitiesThisMonth}</p>
          <p className="text-sm text-text-muted">New This Month</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by DID or handle..."
            className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Identities List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">Identities</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : identities.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            No identities found
          </div>
        ) : (
          <div className="divide-y divide-border">
            {identities.map((identity) => (
              <div
                key={identity.did}
                className="px-6 py-4 hover:bg-surface-hover/50 transition-colors cursor-pointer"
                onClick={() => setSelectedIdentity(identity)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-text-primary truncate">
                      {identity.did}
                    </p>
                    {identity.handle && (
                      <p className="text-sm text-accent">@{identity.handle}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-text-muted">
                    <p>{new Date(identity.createdAt).toLocaleDateString()}</p>
                    {identity.pdsEndpoint && (
                      <p className="text-xs truncate max-w-[200px]">{identity.pdsEndpoint}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Identity Detail Modal */}
      {selectedIdentity && (
        <IdentityDetailModal
          identity={selectedIdentity}
          onClose={() => setSelectedIdentity(null)}
        />
      )}
    </div>
  );
}

interface DetailedIdentity extends PlcIdentity {
  tombstoned?: boolean;
  operationCount?: number;
  latestOperationCid?: string;
}

interface PlcOperation {
  cid: string;
  operation: {
    type: string;
    prev: string | null;
    [key: string]: unknown;
  };
  createdAt: string;
  nullified: boolean;
  prev?: {
    cid: string;
    createdAt: string;
  } | null;
  next?: {
    cid: string;
    createdAt: string;
  } | null;
}

function IdentityDetailModal({
  identity,
  onClose,
}: {
  identity: PlcIdentity;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedOp, setSelectedOp] = useState<PlcOperation | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'operations'>('overview');

  // Get detailed identity info
  const { data: detailedData } = useQuery({
    queryKey: ['admin', 'plc', 'identity', identity.did],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/xrpc/io.exprsn.admin.plc.getIdentity?did=${encodeURIComponent(identity.did)}`,
        { headers: { 'X-Dev-Admin': 'true' } }
      );
      return response.json();
    },
  });

  // Get operations list
  const { data: operationsData, isLoading: opsLoading } = useQuery({
    queryKey: ['admin', 'plc', 'operations', identity.did],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/xrpc/io.exprsn.admin.plc.listOperations?did=${encodeURIComponent(identity.did)}&limit=50`,
        { headers: { 'X-Dev-Admin': 'true' } }
      );
      return response.json();
    },
  });

  // Tombstone mutation
  const tombstoneMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.tombstoneIdentity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Admin': 'true' },
        body: JSON.stringify({ did: identity.did, reason: 'Admin action' }),
      });
      if (!response.ok) throw new Error('Failed to tombstone identity');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plc'] });
      toast.success('Identity tombstoned');
    },
    onError: () => toast.error('Failed to tombstone identity'),
  });

  // Reactivate mutation
  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.reactivateIdentity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Admin': 'true' },
        body: JSON.stringify({ did: identity.did }),
      });
      if (!response.ok) throw new Error('Failed to reactivate identity');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plc'] });
      toast.success('Identity reactivated');
    },
    onError: () => toast.error('Failed to reactivate identity'),
  });

  const detailed: DetailedIdentity = detailedData?.identity || identity;
  const operations: PlcOperation[] = operationsData?.operations || [];
  const isTombstoned = detailed.tombstoned;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Identity Details</h2>
            {isTombstoned && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs bg-red-500/10 text-red-500 rounded-full">
                <TombstoneIcon className="w-3 h-3" /> Tombstoned
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 mb-4 border-b border-border pb-px">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeSubTab === 'overview' ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Overview
            {activeSubTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
          <button
            onClick={() => setActiveSubTab('operations')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeSubTab === 'operations' ? 'text-accent' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Operations ({detailed.operationCount || operations.length})
            {activeSubTab === 'operations' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
        </div>

        {activeSubTab === 'overview' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-text-muted">DID</label>
              <p className="font-mono text-sm text-text-primary break-all">{identity.did}</p>
            </div>

            {identity.handle && (
              <div>
                <label className="text-sm text-text-muted">Handle</label>
                <p className="text-accent">@{identity.handle}</p>
              </div>
            )}

            {identity.pdsEndpoint && (
              <div>
                <label className="text-sm text-text-muted">PDS Endpoint</label>
                <p className="text-sm text-text-primary">{identity.pdsEndpoint}</p>
              </div>
            )}

            {identity.signingKey && (
              <div>
                <label className="text-sm text-text-muted">Signing Key</label>
                <p className="font-mono text-xs text-text-secondary break-all">{identity.signingKey}</p>
              </div>
            )}

            <div>
              <label className="text-sm text-text-muted">Rotation Keys</label>
              <div className="space-y-1 mt-1">
                {identity.rotationKeys.map((key, i) => (
                  <p key={i} className="font-mono text-xs text-text-secondary break-all">
                    {i + 1}. {key}
                  </p>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-text-muted">Created</label>
                <p className="text-sm text-text-primary">
                  {new Date(identity.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <label className="text-sm text-text-muted">Updated</label>
                <p className="text-sm text-text-primary">
                  {new Date(identity.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>

            {detailed.latestOperationCid && (
              <div>
                <label className="text-sm text-text-muted">Latest Operation CID</label>
                <p className="font-mono text-xs text-text-secondary break-all">{detailed.latestOperationCid}</p>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'operations' && (
          <div className="space-y-2">
            {opsLoading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : operations.length === 0 ? (
              <p className="p-4 text-sm text-text-muted text-center">No operations</p>
            ) : (
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <div className="divide-y divide-border max-h-[400px] overflow-auto">
                  {operations.map((op, i) => (
                    <div
                      key={op.cid}
                      className={`p-3 hover:bg-surface-hover/50 cursor-pointer transition-colors ${
                        op.nullified ? 'opacity-50' : ''
                      }`}
                      onClick={() => setSelectedOp(op)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                            {op.operation.type || 'operation'}
                          </span>
                          {op.nullified && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
                              nullified
                            </span>
                          )}
                          {i === 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                              latest
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-text-muted">
                          {new Date(op.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-text-muted mt-1 truncate">{op.cid}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <div className="flex gap-2">
            {isTombstoned ? (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to reactivate this identity?')) {
                    reactivateMutation.mutate();
                  }
                }}
                disabled={reactivateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshIcon className="w-4 h-4" />
                {reactivateMutation.isPending ? 'Reactivating...' : 'Reactivate'}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to tombstone this identity? This will mark it as deleted.')) {
                    tombstoneMutation.mutate();
                  }
                }}
                disabled={tombstoneMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <TombstoneIcon className="w-4 h-4" />
                {tombstoneMutation.isPending ? 'Tombstoning...' : 'Tombstone'}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Close
          </button>
        </div>

        {/* Operation Detail Modal */}
        {selectedOp && (
          <OperationDetailModal
            operation={selectedOp}
            did={identity.did}
            onClose={() => setSelectedOp(null)}
          />
        )}
      </div>
    </div>
  );
}

function OperationDetailModal({
  operation,
  did,
  onClose,
}: {
  operation: PlcOperation;
  did: string;
  onClose: () => void;
}) {
  // Fetch full operation details with prev/next navigation
  const { data } = useQuery({
    queryKey: ['admin', 'plc', 'operation', operation.cid],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/xrpc/io.exprsn.admin.plc.getOperation?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(operation.cid)}`,
        { headers: { 'X-Dev-Admin': 'true' } }
      );
      return response.json();
    },
  });

  const op = data?.operation || operation;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-xl p-5 w-full max-w-xl max-h-[70vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">Operation Details</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted">CID</label>
            <p className="font-mono text-xs text-text-primary break-all">{op.cid}</p>
          </div>

          <div>
            <label className="text-xs text-text-muted">Type</label>
            <p className="text-sm text-accent">{op.operation?.type || 'Unknown'}</p>
          </div>

          <div>
            <label className="text-xs text-text-muted">Created At</label>
            <p className="text-sm text-text-primary">{new Date(op.createdAt).toLocaleString()}</p>
          </div>

          {op.operation?.prev && (
            <div>
              <label className="text-xs text-text-muted">Previous CID</label>
              <p className="font-mono text-xs text-text-secondary break-all">{op.operation.prev}</p>
            </div>
          )}

          {op.nullified && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">This operation has been nullified</p>
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted mb-1 block">Operation Data</label>
            <pre className="p-3 bg-surface border border-border rounded-lg text-xs text-text-secondary overflow-auto max-h-48">
              {JSON.stringify(op.operation, null, 2)}
            </pre>
          </div>

          {/* Navigation */}
          {(op.prev || op.next) && (
            <div className="flex justify-between pt-2 border-t border-border">
              {op.prev ? (
                <button className="text-xs text-accent hover:underline">
                  ← Previous: {op.prev.cid.slice(0, 16)}...
                </button>
              ) : <span />}
              {op.next && (
                <button className="text-xs text-accent hover:underline">
                  Next: {op.next.cid.slice(0, 16)}... →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Handles Tab
// ============================================================================

function HandlesTab() {
  const queryClient = useQueryClient();
  const [showReserveModal, setShowReserveModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plc', 'reservations'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.listReservations`, {
        headers: { 'X-Dev-Admin': 'true' },
      });
      return response.json();
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async (handle: string) => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.plc.releaseHandle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Admin': 'true' },
        body: JSON.stringify({ handle }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plc', 'reservations'] });
      toast.success('Handle released');
    },
    onError: () => toast.error('Failed to release handle'),
  });

  const reservations: HandleReservation[] = data?.reservations || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-500';
      case 'claimed': return 'bg-blue-500/10 text-blue-500';
      case 'expired': return 'bg-yellow-500/10 text-yellow-500';
      case 'released': return 'bg-gray-500/10 text-gray-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowReserveModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Reserve Handle
        </button>
      </div>

      {/* Reservations List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">Handle Reservations</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : reservations.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            No handle reservations
          </div>
        ) : (
          <div className="divide-y divide-border">
            {reservations.map((reservation) => (
              <div
                key={reservation.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-text-primary">@{reservation.handle}</p>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(reservation.status)}`}>
                      {reservation.status}
                    </span>
                    <span className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded-full">
                      {reservation.handleType}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted mt-1">
                    Reserved {new Date(reservation.reservedAt).toLocaleDateString()}
                    {reservation.expiresAt && (
                      <> · Expires {new Date(reservation.expiresAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                {reservation.status === 'active' && (
                  <button
                    onClick={() => {
                      if (confirm(`Release @${reservation.handle}?`)) {
                        releaseMutation.mutate(reservation.handle);
                      }
                    }}
                    disabled={releaseMutation.isPending}
                    className="px-3 py-1 text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Release
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reserve Modal */}
      {showReserveModal && (
        <ReserveHandleModal
          onClose={() => setShowReserveModal(false)}
          onSuccess={() => {
            setShowReserveModal(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'plc', 'reservations'] });
          }}
        />
      )}
    </div>
  );
}

function ReserveHandleModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [handle, setHandle] = useState('');
  const [handleType, setHandleType] = useState<'user' | 'org'>('user');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!handle.trim()) {
      toast.error('Handle is required');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.plc.reserveHandle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Admin': 'true' },
        body: JSON.stringify({ handle: handle.trim(), type: handleType }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to reserve handle');
      }

      toast.success('Handle reserved');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reserve handle');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Reserve Handle</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Handle</label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-surface-hover border border-r-0 border-border rounded-l-lg text-text-muted">@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="username"
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-r-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <p className="text-xs text-text-muted mt-1">
              {handleType === 'user' ? `@${handle || 'username'}.exprsn` : `@${handle || 'username'}.org.exprsn`}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setHandleType('user')}
                className={`flex-1 py-2 rounded-lg transition-colors ${
                  handleType === 'user'
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                User
              </button>
              <button
                onClick={() => setHandleType('org')}
                className={`flex-1 py-2 rounded-lg transition-colors ${
                  handleType === 'org'
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                Organization
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Reserving...' : 'Reserve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Config Tab
// ============================================================================

function ConfigTab() {
  const queryClient = useQueryClient();
  const [showDirectoriesSection, setShowDirectoriesSection] = useState(true);
  const isDev = process.env.NODE_ENV !== 'production';

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plc', 'config'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.getConfig`, {
        headers: { 'X-Dev-Admin': 'true' },
      });
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (config: Partial<PlcConfig>) => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.updateConfig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Admin': 'true' },
        body: JSON.stringify(config),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plc', 'config'] });
      toast.success('Configuration updated');
    },
    onError: () => toast.error('Failed to update configuration'),
  });

  const config: PlcConfig = data || {
    enabled: true,
    mode: 'standalone',
    externalPlcUrl: null,
    defaultPdsEndpoint: '',
    allowedHandleDomains: [],
    reservedHandles: [],
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Exprsn Directories Section */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">Exprsn Directories</h3>
          <p className="text-sm text-text-muted mt-1">
            Connected PLC directory servers for did:exprsn identity management
          </p>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {/* Localhost Directory */}
            <div className="p-4 bg-surface-hover border border-border rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-text-primary">Local Development Server</h4>
                    {isDev && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/10 text-green-500 rounded-full">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-mono text-text-muted">{API_BASE}/plc</p>
                  <p className="text-xs text-text-muted mt-2">
                    Default development PLC directory for local testing
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(`${API_BASE}/plc`, '_blank')}
                    className="px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
                  >
                    Open
                  </button>
                </div>
              </div>
            </div>

            {/* Production Directory (if configured) */}
            {config.externalPlcUrl && config.externalPlcUrl !== 'https://plc.directory' && (
              <div className="p-4 bg-surface-hover border border-border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-text-primary">Custom PLC Directory</h4>
                      <span className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full">
                        Configured
                      </span>
                    </div>
                    <p className="text-sm font-mono text-text-muted">{config.externalPlcUrl}</p>
                  </div>
                  <button
                    onClick={() => config.externalPlcUrl && window.open(config.externalPlcUrl, '_blank')}
                    className="px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
                  >
                    Open
                  </button>
                </div>
              </div>
            )}

            {/* AT Protocol PLC Directory */}
            <div className="p-4 bg-surface-hover border border-border rounded-lg opacity-60">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-text-primary">AT Protocol PLC Directory</h4>
                    <span className="px-2 py-0.5 text-xs bg-text-muted/20 text-text-muted rounded-full">
                      Reference
                    </span>
                  </div>
                  <p className="text-sm font-mono text-text-muted">https://plc.directory</p>
                  <p className="text-xs text-text-muted mt-2">
                    Official AT Protocol PLC directory (for did:plc identities)
                  </p>
                </div>
                <button
                  onClick={() => window.open('https://plc.directory', '_blank')}
                  className="px-3 py-1.5 text-sm bg-surface hover:bg-border text-text-muted rounded transition-colors"
                >
                  Open
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">PLC Mode</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => updateMutation.mutate({ mode: 'standalone' })}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                config.mode === 'standalone'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-text-muted'
              }`}
            >
              <h4 className="font-semibold text-text-primary">Standalone</h4>
              <p className="text-sm text-text-muted mt-1">
                Host your own PLC directory. Be the authoritative source for .exprsn identities.
              </p>
            </button>
            <button
              onClick={() => updateMutation.mutate({ mode: 'external' })}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                config.mode === 'external'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-text-muted'
              }`}
            >
              <h4 className="font-semibold text-text-primary">External</h4>
              <p className="text-sm text-text-muted mt-1">
                Connect to an external PLC directory (e.g., plc.directory).
              </p>
            </button>
          </div>

          {config.mode === 'external' && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-text-muted mb-2">External PLC URL</label>
              <input
                type="text"
                defaultValue={config.externalPlcUrl || ''}
                onBlur={(e) => updateMutation.mutate({ externalPlcUrl: e.target.value || null })}
                placeholder="https://plc.directory"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">Settings</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary">PLC Enabled</p>
              <p className="text-sm text-text-muted">Enable or disable the PLC service</p>
            </div>
            <button
              onClick={() => updateMutation.mutate({ enabled: !config.enabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                config.enabled ? 'bg-accent' : 'bg-surface-hover'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Default PDS Endpoint</label>
            <input
              type="text"
              defaultValue={config.defaultPdsEndpoint}
              onBlur={(e) => updateMutation.mutate({ defaultPdsEndpoint: e.target.value })}
              placeholder="https://pds.exprsn.io"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {/* Handle Format Guide */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
        <h3 className="font-semibold text-blue-400 mb-2">Handle Format Guide</h3>
        <div className="space-y-2 text-sm text-blue-300">
          <p><strong>Users:</strong> @username.exprsn</p>
          <p><strong>Organizations:</strong> @username.org.exprsn</p>
          <p className="text-blue-400/70 mt-2">
            Handles must be 3-20 characters, alphanumeric with underscores allowed.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Audit Tab
// ============================================================================

function AuditTab() {
  const [selectedDid, setSelectedDid] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plc', 'audit', selectedDid],
    queryFn: async () => {
      const params = selectedDid ? `?did=${encodeURIComponent(selectedDid)}` : '';
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.plc.getAuditLog${params}`, {
        headers: { 'X-Dev-Admin': 'true' },
      });
      return response.json();
    },
  });

  const entries: AuditEntry[] = data?.entries || [];

  const getActionColor = (action: string) => {
    if (action.includes('create')) return 'text-green-500';
    if (action.includes('update')) return 'text-blue-500';
    if (action.includes('rotate')) return 'text-yellow-500';
    if (action.includes('delete') || action.includes('revoke')) return 'text-red-500';
    return 'text-text-muted';
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={selectedDid}
            onChange={(e) => setSelectedDid(e.target.value)}
            placeholder="Filter by DID..."
            className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">Audit Log</h3>
        </div>
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            No audit entries
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.id} className="px-6 py-4 hover:bg-surface-hover/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`font-medium ${getActionColor(entry.action)}`}>
                      {entry.action}
                    </span>
                    <span className="text-text-muted"> on </span>
                    <span className="font-mono text-sm text-text-primary">{entry.did}</span>
                  </div>
                  <span className="text-sm text-text-muted">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                {entry.ipAddress && (
                  <p className="text-xs text-text-muted mt-1">
                    IP: {entry.ipAddress}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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

function TombstoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2M9 16v4M15 16v4" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}
