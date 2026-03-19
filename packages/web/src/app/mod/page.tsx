'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { api, type ModerationQueueItem } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

type ContentTypeFilter = 'all' | 'video' | 'comment' | 'user';
type PriorityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type StatusFilter = 'pending' | 'in_review' | 'escalated';

export default function ModQueuePage() {
  const { user, isLoading: authLoading, isModerator } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [contentType, setContentType] = useState<ContentTypeFilter>('all');
  const [priority, setPriority] = useState<PriorityFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('pending');

  // Redirect non-moderators
  if (!authLoading && (!user || !isModerator)) {
    router.replace('/');
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <ModQueueContent
          contentType={contentType}
          priority={priority}
          status={status}
          onContentTypeChange={setContentType}
          onPriorityChange={setPriority}
          onStatusChange={setStatus}
          queryClient={queryClient}
        />
      </main>
    </div>
  );
}

function ModQueueContent({
  contentType,
  priority,
  status,
  onContentTypeChange,
  onPriorityChange,
  onStatusChange,
  queryClient,
}: {
  contentType: ContentTypeFilter;
  priority: PriorityFilter;
  status: StatusFilter;
  onContentTypeChange: (v: ContentTypeFilter) => void;
  onPriorityChange: (v: PriorityFilter) => void;
  onStatusChange: (v: StatusFilter) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['mod-queue', contentType, priority, status],
    queryFn: () =>
      api.getModerationQueue({
        status: status as 'pending' | 'in_review' | 'escalated',
        contentType: contentType !== 'all' ? (contentType as 'video' | 'comment' | 'user') : undefined,
        priority: priority !== 'all' ? (priority as 'low' | 'medium' | 'high' | 'critical') : undefined,
        limit: 50,
      }),
    refetchInterval: 30000,
  });

  const resolveMutation = useMutation({
    mutationFn: (vars: {
      itemId: string;
      action: 'approve' | 'remove' | 'warn' | 'escalate';
      reason: string;
    }) => api.resolveModerationItem(vars),
    onSuccess: (_, vars) => {
      const messages: Record<string, string> = {
        approve: 'Content approved',
        remove: 'Content removed',
        warn: 'Warning issued',
        escalate: 'Escalated to senior moderator',
      };
      toast.success(messages[vars.action] || 'Action applied');
      queryClient.invalidateQueries({ queryKey: ['mod-queue'] });
      queryClient.invalidateQueries({ queryKey: ['mod-quick-stats'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Action failed');
    },
  });

  const stats = data?.stats;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <ShieldIcon className="w-6 h-6 text-orange-400" />
        <h1 className="text-2xl font-bold text-text-primary">Moderation Queue</h1>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Pending" value={stats.pending} colorClass="text-orange-400" />
          <StatCard label="In Review" value={stats.inReview} colorClass="text-yellow-400" />
          <StatCard label="Escalated" value={stats.escalated} colorClass="text-red-400" />
          <StatCard label="Resolved Today" value={stats.resolvedToday} colorClass="text-green-400" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Status filter */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['pending', 'in_review', 'escalated'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                status === s
                  ? 'bg-orange-500 text-white'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {s === 'in_review' ? 'In Review' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Content type filter */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['all', 'video', 'comment', 'user'] as ContentTypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => onContentTypeChange(t)}
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

        {/* Priority filter */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['all', 'critical', 'high', 'medium', 'low'] as PriorityFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => onPriorityChange(p)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors capitalize',
                priority === p
                  ? 'bg-surface text-text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Queue items */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-surface rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16 text-text-muted">
          <p>Failed to load moderation queue.</p>
        </div>
      ) : !data?.items.length ? (
        <div className="text-center py-16">
          <ShieldIcon className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-text-muted">No items in the queue. Good work!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              onAction={(action, reason) =>
                resolveMutation.mutate({ itemId: item.id, action, reason })
              }
              isActing={resolveMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueItem({
  item,
  onAction,
  isActing,
}: {
  item: ModerationQueueItem;
  onAction: (action: 'approve' | 'remove' | 'warn' | 'escalate', reason: string) => void;
  isActing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'remove' | 'warn' | 'escalate' | null>(null);
  const [reason, setReason] = useState('');

  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-surface text-text-muted border-border',
  };

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        {item.content.thumbnail ? (
          <img
            src={item.content.thumbnail}
            alt=""
            className="w-16 h-12 object-cover rounded flex-shrink-0 bg-background"
          />
        ) : (
          <div className="w-16 h-12 rounded flex-shrink-0 bg-background flex items-center justify-center">
            <ContentTypeIcon type={item.contentType} className="w-6 h-6 text-text-muted" />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                priorityColors[item.priority] || priorityColors.low
              )}
            >
              {item.priority}
            </span>
            <span className="text-xs text-text-muted bg-background px-2 py-0.5 rounded capitalize">
              {item.contentType}
            </span>
            <span className="text-xs text-text-muted">
              {item.reportCount} report{item.reportCount !== 1 ? 's' : ''}
            </span>
          </div>
          {item.content.text && (
            <p className="text-sm text-text-primary line-clamp-2 mb-1">{item.content.text}</p>
          )}
          <p className="text-xs text-text-muted">
            by @{item.content.author.handle}
            {item.reasons.length > 0 && (
              <span className="ml-2 text-orange-400">
                Reasons: {item.reasons.slice(0, 3).join(', ')}
                {item.reasons.length > 3 && ` +${item.reasons.length - 3} more`}
              </span>
            )}
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setConfirmAction('approve')}
            disabled={isActing}
            title="Approve"
            className="p-2 rounded-md text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-50"
          >
            <ApproveIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setConfirmAction('remove')}
            disabled={isActing}
            title="Remove"
            className="p-2 rounded-md text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            <RemoveIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setConfirmAction('escalate')}
            disabled={isActing}
            title="Escalate"
            className="p-2 rounded-md text-orange-400 hover:bg-orange-400/10 transition-colors disabled:opacity-50"
          >
            <EscalateIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 rounded-md text-text-muted hover:bg-surface-hover transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronIcon className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Expanded reports */}
      {expanded && item.reports.length > 0 && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Reports ({item.reports.length})
          </p>
          {item.reports.map((report) => (
            <div key={report.id} className="text-sm text-text-muted bg-background rounded-md px-3 py-2">
              <span className="font-medium text-text-primary">@{report.reporter.handle}</span>
              {' · '}
              <span className="capitalize">{report.reason}</span>
              {report.description && (
                <p className="text-xs mt-1 opacity-70">{report.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm action inline */}
      {confirmAction && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <p className="text-sm font-medium text-text-primary mb-2">
            {confirmAction === 'approve' && 'Approve this content?'}
            {confirmAction === 'remove' && 'Remove this content?'}
            {confirmAction === 'warn' && 'Warn the creator?'}
            {confirmAction === 'escalate' && 'Escalate for senior review?'}
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

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 text-center">
      <div className={cn('text-2xl font-bold', colorClass)}>{value}</div>
      <div className="text-xs text-text-muted mt-1">{label}</div>
    </div>
  );
}

function ContentTypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'video') {
    return (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
      </svg>
    );
  }
  if (type === 'comment') {
    return (
      <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function ApproveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function RemoveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function EscalateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
