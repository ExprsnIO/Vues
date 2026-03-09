'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface CreateIdentityModalProps {
  domainId: string;
  handleSuffix: string;
  defaultPdsEndpoint?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateIdentityModal({
  domainId,
  handleSuffix,
  defaultPdsEndpoint,
  isOpen,
  onClose,
  onSuccess,
}: CreateIdentityModalProps) {
  const [handle, setHandle] = useState('');
  const [pdsEndpoint, setPdsEndpoint] = useState(defaultPdsEndpoint || '');
  const [generateSigningKey, setGenerateSigningKey] = useState(true);

  const createMutation = useMutation({
    mutationFn: () =>
      api.adminDomainIdentitiesCreate({
        domainId,
        handle: handle + handleSuffix,
        pdsEndpoint: pdsEndpoint || undefined,
        generateSigningKey,
      }),
    onSuccess: (data) => {
      toast.success(`Identity created: @${handle}${handleSuffix}`);
      onSuccess();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create identity');
    },
  });

  const handleClose = useCallback(() => {
    setHandle('');
    setPdsEndpoint(defaultPdsEndpoint || '');
    setGenerateSigningKey(true);
    onClose();
  }, [onClose, defaultPdsEndpoint]);

  const handleSubmit = () => {
    if (!handle.trim()) {
      toast.error('Handle is required');
      return;
    }
    // Validate handle format
    if (!/^[a-zA-Z0-9_-]+$/.test(handle)) {
      toast.error('Handle can only contain letters, numbers, underscores, and hyphens');
      return;
    }
    if (handle.length < 3) {
      toast.error('Handle must be at least 3 characters');
      return;
    }
    createMutation.mutate();
  };

  if (!isOpen) return null;

  const fullHandle = `@${handle}${handleSuffix}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Create Identity</h2>
          <p className="text-sm text-text-muted mt-1">Create a new PLC identity for this domain</p>
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
                placeholder="username"
                className="flex-1 px-4 py-2 bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                autoFocus
              />
              <span className="inline-flex items-center px-3 bg-surface border border-l-0 border-border rounded-r-lg text-text-muted text-sm">
                {handleSuffix}
              </span>
            </div>
            {handle && (
              <p className="mt-2 text-sm text-accent">
                Full handle: <span className="font-mono">{fullHandle}</span>
              </p>
            )}
          </div>

          {/* PDS Endpoint */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              PDS Endpoint
            </label>
            <input
              type="url"
              value={pdsEndpoint}
              onChange={(e) => setPdsEndpoint(e.target.value)}
              placeholder={defaultPdsEndpoint || 'https://pds.example.com'}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="mt-1 text-xs text-text-muted">
              The PDS endpoint where this identity&apos;s data will be stored
            </p>
          </div>

          {/* Generate Signing Key */}
          <div className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg">
            <div>
              <p className="font-medium text-text-primary">Generate Signing Key</p>
              <p className="text-sm text-text-muted">Create a new signing key for this identity</p>
            </div>
            <button
              type="button"
              onClick={() => setGenerateSigningKey(!generateSigningKey)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                generateSigningKey ? 'bg-accent' : 'bg-surface-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  generateSigningKey ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Info Box */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-400">
              This will create a new DID document in the PLC directory and register the handle.
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
            disabled={!handle.trim() || createMutation.isPending}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Identity'}
          </button>
        </div>
      </div>
    </div>
  );
}
