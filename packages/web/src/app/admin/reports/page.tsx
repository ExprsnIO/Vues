'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ExportButton } from '@/components/admin/ExportModal';
import { FilterBar } from '@/components/admin/ui/FilterBar';
import { useAdminFilters } from '@/hooks/useAdminFilters';
import toast from 'react-hot-toast';

export default function AdminReportsPage() {
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const queryClient = useQueryClient();

  const filters = useAdminFilters({
    defaultFilters: { status: ['pending'] },
    syncWithUrl: true,
  });

  const status = filters.filters.status?.[0] || 'pending';
  const contentType = filters.filters.contentType?.[0] || '';
  const reason = filters.filters.reason?.[0] || '';

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', { status, contentType, reason, search: filters.search }],
    queryFn: () =>
      api.getAdminReports({
        status,
        contentType: contentType || undefined,
        reason: reason || undefined,
      }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ reportId, action, reason }: { reportId: string; action: string; reason: string }) =>
      api.actionAdminReport({ reportId, action, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setSelectedReport(null);
      toast.success('Action taken successfully');
    },
    onError: () => {
      toast.error('Failed to take action');
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (reportId: string) => api.dismissAdminReport({ reportId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setSelectedReport(null);
      toast.success('Report dismissed');
    },
    onError: () => {
      toast.error('Failed to dismiss report');
    },
  });

  const reports = data?.reports || [];

  const filterConfig = useMemo(() => [
    {
      key: 'status',
      label: 'Status',
      multiple: false,
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'reviewed', label: 'Reviewed' },
        { value: 'actioned', label: 'Actioned' },
        { value: 'dismissed', label: 'Dismissed' },
      ],
    },
    {
      key: 'contentType',
      label: 'Content Type',
      multiple: false,
      options: [
        { value: 'video', label: 'Videos' },
        { value: 'comment', label: 'Comments' },
        { value: 'user', label: 'Users' },
      ],
    },
    {
      key: 'reason',
      label: 'Reason',
      multiple: false,
      options: [
        { value: 'spam', label: 'Spam' },
        { value: 'harassment', label: 'Harassment' },
        { value: 'violence', label: 'Violence' },
        { value: 'nudity', label: 'Nudity' },
        { value: 'copyright', label: 'Copyright' },
        { value: 'other', label: 'Other' },
      ],
    },
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Reports</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            {reports.length} pending
          </div>
          <ExportButton
            exportType="reports"
            filters={{
              status: status || undefined,
              contentType: contentType || undefined,
              reason: reason || undefined,
            }}
          />
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        filterConfig={filterConfig}
        searchPlaceholder="Search reports..."
        pageKey="admin-reports"
      />

      {/* Reports List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">
            Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">
            No reports found
          </div>
        ) : (
          reports.map((report: any) => (
            <div
              key={report.id}
              className="bg-surface border border-border rounded-xl p-6 hover:border-accent transition-colors cursor-pointer"
              onClick={() => setSelectedReport(report)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg ${getReasonColor(report.reason)}`}>
                    <ReportIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-text-primary capitalize">
                        {report.contentType} Report
                      </span>
                      <ReasonBadge reason={report.reason} />
                    </div>
                    <p className="text-sm text-text-muted mb-2">
                      Reported by @{report.reporter?.handle || 'Unknown'}
                    </p>
                    {report.description && (
                      <p className="text-sm text-text-secondary line-clamp-2">
                        {report.description}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(report.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Report Detail Modal */}
      {selectedReport && (
        <ReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onAction={(action, reason) =>
            actionMutation.mutate({
              reportId: selectedReport.id,
              action,
              reason,
            })
          }
          onDismiss={() => dismissMutation.mutate(selectedReport.id)}
          isLoading={actionMutation.isPending || dismissMutation.isPending}
        />
      )}
    </div>
  );
}

function ReportModal({
  report,
  onClose,
  onAction,
  onDismiss,
  isLoading,
}: {
  report: any;
  onClose: () => void;
  onAction: (action: string, reason: string) => void;
  onDismiss: () => void;
  isLoading: boolean;
}) {
  const [actionReason, setActionReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-lg shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-text-primary mb-4">Review Report</h2>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">
              Content Type
            </label>
            <p className="text-text-primary capitalize">{report.contentType}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">
              Reason
            </label>
            <ReasonBadge reason={report.reason} />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">
              Reporter
            </label>
            <p className="text-text-primary">@{report.reporter?.handle || 'Unknown'}</p>
          </div>

          {report.description && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">
                Description
              </label>
              <p className="text-text-primary">{report.description}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">
              Action Reason
            </label>
            <textarea
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Provide a reason for your action..."
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              rows={3}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            disabled={isLoading}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Dismiss
          </button>
          <button
            onClick={() => onAction('warn', actionReason)}
            disabled={isLoading || !actionReason}
            className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Warn
          </button>
          <button
            onClick={() => onAction('remove', actionReason)}
            disabled={isLoading || !actionReason}
            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function ReasonBadge({ reason }: { reason: string }) {
  const colors: Record<string, string> = {
    spam: 'bg-blue-500/10 text-blue-500',
    harassment: 'bg-red-500/10 text-red-500',
    violence: 'bg-red-700/10 text-red-700',
    nudity: 'bg-pink-500/10 text-pink-500',
    copyright: 'bg-purple-500/10 text-purple-500',
    other: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[reason] || colors.other}`}>
      {reason}
    </span>
  );
}

function getReasonColor(reason: string): string {
  const colors: Record<string, string> = {
    spam: 'bg-blue-500/10 text-blue-500',
    harassment: 'bg-red-500/10 text-red-500',
    violence: 'bg-red-700/10 text-red-700',
    nudity: 'bg-pink-500/10 text-pink-500',
    copyright: 'bg-purple-500/10 text-purple-500',
    other: 'bg-gray-500/10 text-gray-500',
  };
  return colors[reason] || colors.other;
}

function ReportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
