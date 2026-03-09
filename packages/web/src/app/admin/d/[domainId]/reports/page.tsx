// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

interface Report {
  id: string;
  type: 'content' | 'user' | 'comment';
  targetUri: string;
  reason: string;
  description?: string;
  status: ReportStatus;
  reporter: {
    did: string;
    handle: string;
  };
  createdAt: string;
  resolvedAt?: string;
}

export default function DomainReportsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('pending');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'reports', statusFilter],
    queryFn: () => api.adminDomainReportsList(domainId, { status: statusFilter || undefined }),
    enabled: !!domainId,
  });

  const resolveMutation = useMutation({
    mutationFn: (data: { id: string; resolution: string; notes?: string }) =>
      api.adminDomainReportsResolve(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'reports'] });
      setSelectedReport(null);
      toast.success('Report resolved');
    },
    onError: () => toast.error('Failed to resolve report'),
  });

  const domain = domainData?.domain;
  const reports = reportsData?.reports || [];

  const getStatusBadge = (status: ReportStatus) => {
    const styles = {
      pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
      reviewed: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      resolved: 'bg-green-500/10 text-green-400 border-green-500/30',
      dismissed: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
    };
    return styles[status];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Reports</h1>
        <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReportStatus | '')}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
        >
          <option value="">All Reports</option>
          <option value="pending">Pending</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {/* Reports List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <ReportIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No reports found</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Reporter</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-4">
                    <span className="text-text-primary capitalize">{report.type}</span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-text-primary font-medium">{report.reason}</p>
                    {report.description && (
                      <p className="text-text-muted text-sm truncate max-w-xs">{report.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-text-muted text-sm">@{report.reporter.handle}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(report.status)}`}>
                      {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-text-muted text-sm">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      onClick={() => setSelectedReport(report)}
                      className="text-accent hover:text-accent-hover text-sm"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedReport(null)} />
          <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-text-primary mb-4">Review Report</h2>
            <div className="space-y-4">
              <div>
                <p className="text-text-muted text-sm">Type</p>
                <p className="text-text-primary capitalize">{selectedReport.type}</p>
              </div>
              <div>
                <p className="text-text-muted text-sm">Reason</p>
                <p className="text-text-primary">{selectedReport.reason}</p>
              </div>
              {selectedReport.description && (
                <div>
                  <p className="text-text-muted text-sm">Description</p>
                  <p className="text-text-primary">{selectedReport.description}</p>
                </div>
              )}
              <div>
                <p className="text-text-muted text-sm">Reporter</p>
                <p className="text-text-primary">@{selectedReport.reporter.handle}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSelectedReport(null)}
                className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => resolveMutation.mutate({ id: selectedReport.id, resolution: 'dismissed' })}
                disabled={resolveMutation.isPending}
                className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg"
              >
                Dismiss
              </button>
              <button
                onClick={() => resolveMutation.mutate({ id: selectedReport.id, resolution: 'resolved' })}
                disabled={resolveMutation.isPending}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
              >
                Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}
