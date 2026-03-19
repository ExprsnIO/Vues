'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { api, type AdminReport } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn, formatDistanceToNow } from '@/lib/utils';
import toast from 'react-hot-toast';

type StatusFilter = 'pending' | 'actioned' | 'dismissed';
type ContentTypeFilter = 'all' | 'video' | 'comment' | 'user';

export default function ModReportsPage() {
  const { user, isLoading: authLoading, isModerator } = useAuth();
  const router = useRouter();

  if (!authLoading && (!user || !isModerator)) {
    router.replace('/');
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <ReportsContent />
      </main>
    </div>
  );
}

function ReportsContent() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [contentType, setContentType] = useState<ContentTypeFilter>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['mod-reports', status, contentType],
    queryFn: () =>
      api.getAdminReports({
        status,
        contentType: contentType !== 'all' ? contentType : undefined,
        limit: 50,
      }),
    refetchInterval: 30000,
  });

  const actionMutation = useMutation({
    mutationFn: (vars: { reportId: string; action: string; reason: string }) =>
      api.actionAdminReport(vars),
    onSuccess: (_, vars) => {
      const messages: Record<string, string> = {
        actioned: 'Report actioned',
        dismissed: 'Report dismissed',
        escalated: 'Report escalated',
      };
      toast.success(messages[vars.action] || 'Report updated');
      queryClient.invalidateQueries({ queryKey: ['mod-reports'] });
      queryClient.invalidateQueries({ queryKey: ['mod-quick-stats'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update report');
    },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <FlagIcon className="w-6 h-6 text-orange-400" />
        <h1 className="text-2xl font-bold text-text-primary">Reports</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Status */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['pending', 'actioned', 'dismissed'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors capitalize',
                status === s
                  ? 'bg-orange-500 text-white'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Content type */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['all', 'video', 'comment', 'user'] as ContentTypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setContentType(t)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors capitalize',
                contentType === t
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Reports list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-surface rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-text-muted">
          <p>Failed to load reports.</p>
        </div>
      ) : !data?.reports.length ? (
        <div className="text-center py-16">
          <FlagIcon className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-text-muted">No reports in this queue.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onAction={(action, reason) =>
                actionMutation.mutate({ reportId: report.id, action, reason })
              }
              isActing={actionMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  report,
  onAction,
  isActing,
}: {
  report: AdminReport;
  onAction: (action: string, reason: string) => void;
  isActing: boolean;
}) {
  const [confirmAction, setConfirmAction] = useState<'actioned' | 'dismissed' | 'escalated' | null>(null);
  const [reason, setReason] = useState('');

  const reasonLabels: Record<string, string> = {
    spam: 'Spam',
    harassment: 'Harassment',
    hate_speech: 'Hate Speech',
    violence: 'Violence',
    nudity: 'Nudity',
    misinformation: 'Misinformation',
    copyright: 'Copyright',
    self_harm: 'Self Harm',
    other: 'Other',
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-start gap-4">
        {/* Reporter info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-medium text-text-primary">
              {report.reporter ? `@${report.reporter.handle}` : 'Unknown reporter'}
            </span>
            <span className="text-xs text-text-muted">reported</span>
            <span className="text-xs font-medium bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded capitalize">
              {report.contentType}
            </span>
            <span className="text-xs text-text-muted">
              {formatDistanceToNow(new Date(report.createdAt))} ago
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs bg-background text-text-muted px-2 py-0.5 rounded border border-border">
              {reasonLabels[report.reason] || report.reason}
            </span>
            {report.description && (
              <span className="text-xs text-text-muted italic line-clamp-1">
                &ldquo;{report.description}&rdquo;
              </span>
            )}
          </div>

          <p className="text-xs text-text-muted font-mono truncate opacity-60">
            {report.contentUri}
          </p>
        </div>

        {/* Actions */}
        {report.status === 'pending' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setConfirmAction('actioned')}
              disabled={isActing}
              className="px-3 py-1.5 text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 rounded-md transition-colors disabled:opacity-50"
            >
              Action
            </button>
            <button
              onClick={() => setConfirmAction('dismissed')}
              disabled={isActing}
              className="px-3 py-1.5 text-xs font-medium bg-surface text-text-muted hover:bg-surface-hover border border-border rounded-md transition-colors disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              onClick={() => setConfirmAction('escalated')}
              disabled={isActing}
              className="px-3 py-1.5 text-xs font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/30 rounded-md transition-colors disabled:opacity-50"
            >
              Escalate
            </button>
          </div>
        )}

        {report.status !== 'pending' && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded capitalize flex-shrink-0',
              report.status === 'actioned'
                ? 'bg-green-500/10 text-green-400'
                : 'bg-surface text-text-muted'
            )}
          >
            {report.status}
          </span>
        )}
      </div>

      {/* Confirmation */}
      {confirmAction && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-sm font-medium text-text-primary mb-2">
            {confirmAction === 'actioned' && 'Take action on this report?'}
            {confirmAction === 'dismissed' && 'Dismiss this report?'}
            {confirmAction === 'escalated' && 'Escalate to senior moderator?'}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            rows={2}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-orange-400 mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                setConfirmAction(null);
                setReason('');
              }}
              className="px-3 py-1.5 text-sm text-text-muted border border-border rounded-md hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!reason.trim()) return;
                onAction(confirmAction, reason.trim());
                setConfirmAction(null);
                setReason('');
              }}
              disabled={!reason.trim() || isActing}
              className="px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              {isActing ? 'Applying...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}
