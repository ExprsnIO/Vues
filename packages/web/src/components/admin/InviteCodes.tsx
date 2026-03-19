// @ts-nocheck
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export function InviteCodesSection({ domainId }: { domainId: string }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedCode, setSelectedCode] = useState<any>(null);

  const { data: codesData, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'invite-codes', domainId],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/xrpc/io.exprsn.admin.inviteCodes.list?domainId=${domainId}&limit=50`,
        { credentials: 'include' }
      );
      return res.json();
    },
    enabled: !!domainId,
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin', 'invite-codes-stats', domainId],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/xrpc/io.exprsn.admin.inviteCodes.stats?domainId=${domainId}`,
        { credentials: 'include' }
      );
      return res.json();
    },
    enabled: !!domainId,
  });

  const codes = codesData?.codes || [];
  const stats = statsData?.stats || { total: 0, active: 0, revoked: 0, expired: 0, exhausted: 0, totalUses: 0 };

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Invite Codes</h2>
            <p className="text-sm text-text-muted">Certificate-backed invite codes for user registration</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowBatchModal(true)}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary text-sm rounded-lg"
            >
              Batch Create
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse text-sm rounded-lg"
            >
              Create Code
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="p-3 bg-surface-hover rounded-lg">
            <p className="text-text-muted text-xs">Total</p>
            <p className="text-text-primary text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="p-3 bg-success/10 rounded-lg">
            <p className="text-text-muted text-xs">Active</p>
            <p className="text-success text-2xl font-bold">{stats.active}</p>
          </div>
          <div className="p-3 bg-text-muted/10 rounded-lg">
            <p className="text-text-muted text-xs">Exhausted</p>
            <p className="text-text-primary text-2xl font-bold">{stats.exhausted}</p>
          </div>
          <div className="p-3 bg-warning/10 rounded-lg">
            <p className="text-text-muted text-xs">Expired</p>
            <p className="text-warning text-2xl font-bold">{stats.expired}</p>
          </div>
          <div className="p-3 bg-red-500/10 rounded-lg">
            <p className="text-text-muted text-xs">Revoked</p>
            <p className="text-red-500 text-2xl font-bold">{stats.revoked}</p>
          </div>
          <div className="p-3 bg-accent/10 rounded-lg">
            <p className="text-text-muted text-xs">Total Uses</p>
            <p className="text-accent text-2xl font-bold">{stats.totalUses}</p>
          </div>
        </div>

        {codes.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-text-muted/40 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <p className="text-text-muted mb-4">No invite codes created yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
            >
              Create Your First Code
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {codes.map((code: any) => (
              <div
                key={code.id}
                className="flex items-center justify-between p-4 bg-surface-hover hover:bg-border rounded-lg transition-colors cursor-pointer"
                onClick={() => setSelectedCode(code)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <code className="text-lg font-mono font-semibold text-accent">{code.code}</code>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(code.code);
                        toast.success('Code copied to clipboard');
                      }}
                      className="p-1.5 hover:bg-accent/20 rounded text-accent transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-text-muted mt-1">
                    {code.metadata?.name || code.metadata?.description || 'No description'}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-text-primary">
                      {code.usedCount}/{code.maxUses || '∞'} uses
                    </p>
                    <p className="text-xs text-text-muted">
                      {code.expiresAt
                        ? new Date(code.expiresAt) > new Date()
                          ? `Expires ${new Date(code.expiresAt).toLocaleDateString()}`
                          : 'Expired'
                        : 'Never expires'}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      code.status === 'active'
                        ? 'bg-success/20 text-success'
                        : code.status === 'exhausted'
                          ? 'bg-text-muted/20 text-text-muted'
                          : code.status === 'expired'
                            ? 'bg-warning/20 text-warning'
                            : 'bg-red-500/20 text-red-500'
                    }`}
                  >
                    {code.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateInviteCodeModal
          domainId={domainId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetch();
          }}
        />
      )}

      {showBatchModal && (
        <BatchCreateInviteCodesModal
          domainId={domainId}
          onClose={() => setShowBatchModal(false)}
          onSuccess={() => {
            setShowBatchModal(false);
            refetch();
          }}
        />
      )}

      {selectedCode && (
        <InviteCodeDetailsModal
          code={selectedCode}
          onClose={() => setSelectedCode(null)}
          onRevoke={() => {
            setSelectedCode(null);
            refetch();
          }}
        />
      )}
    </>
  );
}

function CreateInviteCodeModal({
  domainId,
  onClose,
  onSuccess,
}: {
  domainId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [neverExpires, setNeverExpires] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/xrpc/io.exprsn.admin.inviteCodes.create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error('Failed to create invite code');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Invite code created');
      onSuccess();
    },
    onError: () => toast.error('Failed to create invite code'),
  });

  const handleSubmit = () => {
    const expiresAt = neverExpires
      ? undefined
      : new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString();

    createMutation.mutate({
      domainId,
      maxUses: parseInt(maxUses) || undefined,
      expiresAt,
      metadata: {
        name: name || undefined,
        description: description || undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Create Invite Code</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Name (Optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Beta Testers Batch"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Description (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="For early access users"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Max Uses</label>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              min="1"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">Number of times this code can be used</p>
          </div>
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={neverExpires}
                onChange={(e) => setNeverExpires(e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent"
              />
              <span className="text-sm text-text-muted">Never expires</span>
            </label>
            {!neverExpires && (
              <>
                <label className="block text-sm text-text-muted mb-1">Expires in (days)</label>
                <input
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  min="1"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Code'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchCreateInviteCodesModal({
  domainId,
  onClose,
  onSuccess,
}: {
  domainId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [count, setCount] = useState('10');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [neverExpires, setNeverExpires] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/xrpc/io.exprsn.admin.inviteCodes.batchCreate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error('Failed to create invite codes');
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Created ${data.total} invite codes`);
      onSuccess();
    },
    onError: () => toast.error('Failed to create invite codes'),
  });

  const handleSubmit = () => {
    const expiresAt = neverExpires
      ? undefined
      : new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString();

    createMutation.mutate({
      domainId,
      count: parseInt(count),
      maxUses: parseInt(maxUses) || undefined,
      expiresAt,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Batch Create Invite Codes</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Number of Codes</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              min="1"
              max="100"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
            <p className="text-xs text-text-muted mt-1">Maximum 100 codes per batch</p>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Max Uses Per Code</label>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              min="1"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={neverExpires}
                onChange={(e) => setNeverExpires(e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent"
              />
              <span className="text-sm text-text-muted">Never expires</span>
            </label>
            {!neverExpires && (
              <>
                <label className="block text-sm text-text-muted mb-1">Expires in (days)</label>
                <input
                  type="number"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  min="1"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                />
              </>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending || parseInt(count) < 1 || parseInt(count) > 100}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : `Create ${count} Codes`}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteCodeDetailsModal({
  code,
  onClose,
  onRevoke,
}: {
  code: any;
  onClose: () => void;
  onRevoke: () => void;
}) {
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'}/xrpc/io.exprsn.admin.inviteCodes.revoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: code.id,
            reason: revokeReason || 'Revoked by admin',
          }),
        }
      );
      if (!res.ok) throw new Error('Failed to revoke code');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Invite code revoked');
      onRevoke();
    },
    onError: () => toast.error('Failed to revoke code'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">Invite Code Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-hover rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!showRevokeConfirm ? (
          <>
            <div className="space-y-4">
              <div className="p-4 bg-surface-hover rounded-lg">
                <p className="text-sm text-text-muted mb-2">Invite Code</p>
                <div className="flex items-center gap-2">
                  <code className="text-2xl font-mono font-bold text-accent">{code.code}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(code.code);
                      toast.success('Code copied');
                    }}
                    className="p-2 hover:bg-accent/20 rounded text-accent"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-text-muted">Status</p>
                  <span
                    className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-medium ${
                      code.status === 'active'
                        ? 'bg-success/20 text-success'
                        : code.status === 'exhausted'
                          ? 'bg-text-muted/20 text-text-muted'
                          : code.status === 'expired'
                            ? 'bg-warning/20 text-warning'
                            : 'bg-red-500/20 text-red-500'
                    }`}
                  >
                    {code.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-text-muted">Uses</p>
                  <p className="text-lg font-semibold text-text-primary mt-1">
                    {code.usedCount} / {code.maxUses || '∞'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-text-muted">Created</p>
                  <p className="text-sm text-text-primary mt-1">
                    {new Date(code.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-text-muted">Expires</p>
                  <p className="text-sm text-text-primary mt-1">
                    {code.expiresAt
                      ? new Date(code.expiresAt).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
              </div>

              {code.metadata && (code.metadata.name || code.metadata.description) && (
                <div>
                  <p className="text-sm text-text-muted">Metadata</p>
                  <div className="mt-2 p-3 bg-surface-hover rounded-lg">
                    {code.metadata.name && (
                      <p className="text-sm font-medium text-text-primary">{code.metadata.name}</p>
                    )}
                    {code.metadata.description && (
                      <p className="text-sm text-text-muted mt-1">{code.metadata.description}</p>
                    )}
                  </div>
                </div>
              )}

              {code.certificateId && (
                <div>
                  <p className="text-sm text-text-muted">Certificate ID</p>
                  <code className="text-xs text-text-primary font-mono">{code.certificateId}</code>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t border-border">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
              >
                Close
              </button>
              {code.status === 'active' && (
                <button
                  onClick={() => setShowRevokeConfirm(true)}
                  className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-lg"
                >
                  Revoke Code
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-500 font-medium">Are you sure you want to revoke this code?</p>
                <p className="text-sm text-text-muted mt-1">This action cannot be undone.</p>
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">Reason (Optional)</label>
                <textarea
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Why are you revoking this code?"
                  rows={3}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowRevokeConfirm(false)}
                className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => revokeMutation.mutate()}
                disabled={revokeMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50"
              >
                {revokeMutation.isPending ? 'Revoking...' : 'Revoke Code'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
