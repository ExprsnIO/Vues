'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface ReserveHandleModalProps {
  domainId: string;
  handleSuffix: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReserveHandleModal({
  domainId,
  handleSuffix,
  isOpen,
  onClose,
  onSuccess,
}: ReserveHandleModalProps) {
  const [handle, setHandle] = useState('');
  const [handleType, setHandleType] = useState<'user' | 'org'>('user');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');

  const reserveMutation = useMutation({
    mutationFn: () =>
      api.adminDomainHandlesReserve({
        domainId,
        handle: handle + handleSuffix,
        handleType,
        expiresAt: expiresAt || undefined,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success(`Handle reserved: @${handle}${handleSuffix}`);
      onSuccess();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reserve handle');
    },
  });

  const handleClose = useCallback(() => {
    setHandle('');
    setHandleType('user');
    setExpiresAt('');
    setReason('');
    onClose();
  }, [onClose]);

  const handleSubmit = () => {
    if (!handle.trim()) {
      toast.error('Handle is required');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(handle)) {
      toast.error('Handle can only contain letters, numbers, underscores, and hyphens');
      return;
    }
    if (handle.length < 2) {
      toast.error('Handle must be at least 2 characters');
      return;
    }
    reserveMutation.mutate();
  };

  if (!isOpen) return null;

  // Calculate min date (today) for expiration picker
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Reserve Handle</h2>
          <p className="text-sm text-text-muted mt-1">Reserve a handle for future use</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Handle Input */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Handle <span className="text-red-500">*</span>
            </label>
            <div className="flex">
              <span className="inline-flex items-center px-3 bg-surface border border-r-0 border-border rounded-l-lg text-text-muted">
                @
              </span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="reserved-handle"
                className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                autoFocus
              />
              <span className="inline-flex items-center px-3 bg-surface border border-l-0 border-border rounded-r-lg text-text-muted text-sm">
                {handleSuffix}
              </span>
            </div>
            {handle && (
              <p className="mt-2 text-sm text-accent">
                Reserved: <span className="font-mono">@{handle}{handleSuffix}</span>
              </p>
            )}
          </div>

          {/* Handle Type */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Handle Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHandleType('user')}
                className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                  handleType === 'user'
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-surface border-border text-text-muted hover:border-accent/50'
                }`}
              >
                User
              </button>
              <button
                type="button"
                onClick={() => setHandleType('org')}
                className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                  handleType === 'org'
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-surface border-border text-text-muted hover:border-accent/50'
                }`}
              >
                Organization
              </button>
            </div>
          </div>

          {/* Expiration Date */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Expiration Date (Optional)
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={today}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-text-muted">
              Leave empty for indefinite reservation
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Reason (Optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this handle being reserved?"
              rows={2}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {/* Info Box */}
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-400">
              Reserved handles cannot be claimed by users until the reservation expires or is released.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!handle.trim() || reserveMutation.isPending}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reserveMutation.isPending ? 'Reserving...' : 'Reserve Handle'}
          </button>
        </div>
      </div>
    </div>
  );
}
