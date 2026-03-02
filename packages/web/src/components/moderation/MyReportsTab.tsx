'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type ReportStatus = 'all' | 'pending' | 'reviewed' | 'actioned' | 'dismissed';

interface Report {
  id: string;
  contentType: string;
  contentUri: string;
  reason: string;
  description?: string;
  status: string;
  actionTaken?: string;
  createdAt: string;
  reviewedAt?: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Pending Review' },
  reviewed: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Reviewed' },
  actioned: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Action Taken' },
  dismissed: { bg: 'bg-gray-500/10', text: 'text-gray-500', label: 'Dismissed' },
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video: 'Video',
  comment: 'Comment',
  user: 'User',
  sound: 'Sound',
};

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  violence: 'Violence',
  nudity: 'Nudity/Sexual Content',
  copyright: 'Copyright Violation',
  other: 'Other',
};

export function MyReportsTab() {
  const [statusFilter, setStatusFilter] = useState<ReportStatus>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-reports', statusFilter],
    queryFn: () =>
      api.getUserModerationReports(statusFilter === 'all' ? undefined : statusFilter),
  });

  const reports: Report[] = data?.reports || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-error">Failed to load reports. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {(['all', 'pending', 'reviewed', 'actioned', 'dismissed'] as ReportStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              statusFilter === status
                ? 'bg-accent text-text-inverse'
                : 'bg-surface hover:bg-surface-hover text-text-secondary'
            )}
          >
            {status === 'all' ? 'All Reports' : STATUS_STYLES[status]?.label || status}
          </button>
        ))}
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <EmptyState filter={statusFilter} />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  const status = STATUS_STYLES[report.status] || STATUS_STYLES.pending;

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted uppercase tracking-wide">
              {CONTENT_TYPE_LABELS[report.contentType] || report.contentType}
            </span>
            <span className="text-text-muted">•</span>
            <span className="text-sm text-text-secondary">
              {REASON_LABELS[report.reason] || report.reason}
            </span>
          </div>

          {report.description && (
            <p className="mt-2 text-text-secondary text-sm line-clamp-2">
              {report.description}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3 text-xs text-text-muted">
            <span>Submitted {formatDate(report.createdAt)}</span>
            {report.reviewedAt && (
              <>
                <span>•</span>
                <span>Reviewed {formatDate(report.reviewedAt)}</span>
              </>
            )}
          </div>

          {report.actionTaken && (
            <div className="mt-2 text-sm text-text-secondary">
              <span className="font-medium">Action taken:</span> {report.actionTaken}
            </div>
          )}
        </div>

        <div className="flex-shrink-0">
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
              status.bg,
              status.text
            )}
          >
            {status.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: ReportStatus }) {
  return (
    <div className="text-center py-12 bg-surface rounded-lg border border-border">
      <FlagIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
      <h3 className="text-lg font-medium text-text-primary mb-2">
        {filter === 'all' ? "You haven't reported any content" : `No ${filter} reports`}
      </h3>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        When you report content that violates our community guidelines, it will appear here
        so you can track its status.
      </p>
    </div>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
