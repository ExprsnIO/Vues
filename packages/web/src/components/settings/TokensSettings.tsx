'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

interface TokenSummary {
  active: number;
  total: number;
  expiringIn7Days: number;
}

export function TokensSettings() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['user', 'tokens', 'summary'],
    queryFn: async () => {
      // Mock data - replace with actual API call
      const mockSummary: TokenSummary = {
        active: 3,
        total: 5,
        expiringIn7Days: 1,
      };
      return mockSummary;
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-32 bg-surface-hover rounded" />
        <div className="h-10 bg-surface-hover rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-surface-hover rounded-lg text-center">
          <p className="text-lg font-semibold text-text-primary">{summary?.active || 0}</p>
          <p className="text-xs text-text-muted">Active</p>
        </div>
        <div className="p-3 bg-surface-hover rounded-lg text-center">
          <p className="text-lg font-semibold text-text-primary">{summary?.total || 0}</p>
          <p className="text-xs text-text-muted">Total</p>
        </div>
        <div className={`p-3 rounded-lg text-center ${
          summary?.expiringIn7Days ? 'bg-yellow-500/10' : 'bg-surface-hover'
        }`}>
          <p className={`text-lg font-semibold ${
            summary?.expiringIn7Days ? 'text-yellow-500' : 'text-text-primary'
          }`}>
            {summary?.expiringIn7Days || 0}
          </p>
          <p className="text-xs text-text-muted">Expiring</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-2">
        <Link
          href="/settings/tokens"
          className="flex items-center justify-between px-4 py-3 bg-surface-hover hover:bg-surface rounded-lg transition-colors group"
        >
          <div className="flex items-center gap-3">
            <KeyIcon className="w-5 h-5 text-text-muted group-hover:text-accent transition-colors" />
            <span className="text-sm text-text-primary">Manage Access Tokens</span>
          </div>
          <ChevronIcon className="w-4 h-4 text-text-muted" />
        </Link>

        <Link
          href="/settings/tokens"
          className="flex items-center justify-center gap-2 px-4 py-2 border border-border hover:border-accent text-text-muted hover:text-accent rounded-lg transition-colors text-sm"
        >
          <PlusIcon className="w-4 h-4" />
          Create New Token
        </Link>
      </div>

      {/* Info */}
      <p className="text-xs text-text-muted">
        Personal access tokens allow apps and scripts to access your account.
        Create tokens with custom permissions and expiration times.
      </p>
    </div>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
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
