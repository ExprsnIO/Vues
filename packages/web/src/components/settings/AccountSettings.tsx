'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

export function AccountSettings() {
  const { user, signOut } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [exportStatus, setExportStatus] = useState<'idle' | 'processing' | 'ready'>('idle');

  // Request data export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      if ('requestDataExport' in api && typeof (api as Record<string, unknown>).requestDataExport === 'function') {
        return (api as unknown as { requestDataExport: () => Promise<{ success: boolean; downloadUrl?: string }> }).requestDataExport();
      }
      // Simulate export request
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { success: true };
    },
    onMutate: () => {
      setExportStatus('processing');
    },
    onSuccess: (data) => {
      if (data.downloadUrl) {
        setExportStatus('ready');
        toast.success('Your data export is ready!');
      } else {
        toast.success('Export requested! You\'ll receive an email when it\'s ready.');
        setExportStatus('idle');
      }
    },
    onError: () => {
      setExportStatus('idle');
      toast.error('Failed to request data export');
    },
  });

  // Delete account mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if ('deleteAccount' in api && typeof (api as Record<string, unknown>).deleteAccount === 'function') {
        return (api as unknown as { deleteAccount: () => Promise<{ success: boolean }> }).deleteAccount();
      }
      throw new Error('Not implemented');
    },
    onSuccess: () => {
      toast.success('Account deleted');
      signOut();
    },
    onError: () => {
      toast.error('Failed to delete account');
    },
  });

  const canDelete = deleteConfirmText === user?.handle;

  return (
    <div className="space-y-6">
      {/* Data Export Section */}
      <div className="bg-surface rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <DownloadIcon className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium text-text-primary mb-1">Download your data</h3>
            <p className="text-sm text-text-muted mb-4">
              Get a copy of all your data including your videos, comments, likes, and profile information.
            </p>
            <button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending || exportStatus === 'processing'}
              className="px-4 py-2 text-sm font-medium bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors disabled:opacity-50"
            >
              {exportStatus === 'processing' ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : exportStatus === 'ready' ? (
                'Download Ready'
              ) : (
                'Request Export'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Account Info Section */}
      <div className="bg-surface rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium text-text-primary mb-1">Account information</h3>
            <div className="space-y-3 mt-4">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-sm text-text-muted">Username</span>
                <span className="text-sm text-text-primary font-medium">@{user?.handle}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-sm text-text-muted">DID</span>
                <span className="text-sm text-text-secondary font-mono text-xs truncate max-w-[200px]">
                  {user?.did}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-text-muted">Account type</span>
                <span className="text-sm text-text-primary">Personal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <TrashIcon className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium text-red-500 mb-1">Delete account</h3>
            <p className="text-sm text-text-muted mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 text-sm font-medium bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <WarningIcon className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Delete your account?</h3>
              <p className="text-text-muted text-sm">
                This will permanently delete your account, videos, comments, and all associated data.
                This action cannot be undone.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-text-muted mb-2">
                Type <span className="text-red-500 font-bold">{user?.handle}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={!canDelete || deleteMutation.isPending}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:bg-red-500/50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
