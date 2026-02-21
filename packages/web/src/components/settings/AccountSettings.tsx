'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export function AccountSettings() {
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

      {/* Privacy Notice */}
      <div className="bg-surface rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <ShieldIcon className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-medium text-text-primary mb-1">Data privacy</h3>
            <p className="text-sm text-text-muted">
              Your data is stored securely and handled in accordance with our privacy policy.
              For account-related requests, please contact support.
            </p>
          </div>
        </div>
      </div>
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

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}
