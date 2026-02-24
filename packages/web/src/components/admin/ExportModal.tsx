'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export type ExportType =
  | 'users'
  | 'reports'
  | 'auditLogs'
  | 'analytics'
  | 'payments'
  | 'renderJobs'
  | 'organizations'
  | 'sanctions';

export type ExportFormat = 'csv' | 'xlsx' | 'sqlite';

interface ExportFilters {
  status?: string;
  role?: string;
  contentType?: string;
  reason?: string;
  action?: string;
  actorDid?: string;
  metric?: string;
  type?: string;
  verified?: boolean;
  apiAccess?: boolean;
  startDate?: string;
  endDate?: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportType: ExportType;
  filters?: ExportFilters;
  title?: string;
}

const exportTypeLabels: Record<ExportType, string> = {
  users: 'Users',
  reports: 'Reports',
  auditLogs: 'Audit Logs',
  analytics: 'Analytics',
  payments: 'Payments',
  renderJobs: 'Render Jobs',
  organizations: 'Organizations',
  sanctions: 'Sanctions',
};

const formatLabels: Record<ExportFormat, { label: string; description: string }> = {
  csv: {
    label: 'CSV',
    description: 'Comma-separated values, compatible with Excel and most spreadsheet applications',
  },
  xlsx: {
    label: 'Excel (XLSX)',
    description: 'Microsoft Excel format with formatting preserved',
  },
  sqlite: {
    label: 'SQLite Database',
    description: 'Portable database file for advanced analysis and querying',
  },
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'csv';
    case 'xlsx':
      return 'xlsx';
    case 'sqlite':
      return 'db';
  }
}

function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'sqlite':
      return 'application/x-sqlite3';
  }
}

export function ExportModal({
  isOpen,
  onClose,
  exportType,
  filters = {},
  title,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [dateRange, setDateRange] = useState({
    startDate: filters.startDate || '',
    endDate: filters.endDate || '',
  });
  const [includeDateRange, setIncludeDateRange] = useState(false);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const options: any = {
        format,
        ...filters,
      };

      if (includeDateRange) {
        if (dateRange.startDate) options.startDate = dateRange.startDate;
        if (dateRange.endDate) options.endDate = dateRange.endDate;
      }

      switch (exportType) {
        case 'users':
          return api.exportUsers(options);
        case 'reports':
          return api.exportReports(options);
        case 'auditLogs':
          return api.exportAuditLogs(options);
        case 'analytics':
          return api.exportAnalytics(options);
        case 'payments':
          return api.exportPayments(options);
        case 'renderJobs':
          return api.exportRenderJobs(options);
        case 'organizations':
          return api.exportOrganizations(options);
        case 'sanctions':
          return api.exportSanctions(options);
      }
    },
    onSuccess: (blob) => {
      if (blob) {
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `${exportType}-export-${timestamp}.${getFileExtension(format)}`;
        downloadBlob(blob, filename);
        toast.success(`${exportTypeLabels[exportType]} exported successfully`);
        onClose();
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to export data');
    },
  });

  const handleExport = () => {
    exportMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            {title || `Export ${exportTypeLabels[exportType]}`}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            Choose a format and configure your export options
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-3">
              Export Format
            </label>
            <div className="space-y-2">
              {(Object.keys(formatLabels) as ExportFormat[]).map((f) => (
                <label
                  key={f}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    format === f
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-border-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {formatLabels[f].label}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {formatLabels[f].description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range Filter (for applicable export types) */}
          {['users', 'reports', 'auditLogs', 'analytics', 'payments', 'renderJobs', 'sanctions'].includes(
            exportType
          ) && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  id="includeDateRange"
                  checked={includeDateRange}
                  onChange={(e) => setIncludeDateRange(e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <label
                  htmlFor="includeDateRange"
                  className="text-sm font-medium text-text-primary"
                >
                  Filter by date range
                </label>
              </div>

              {includeDateRange && (
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={dateRange.startDate}
                      onChange={(e) =>
                        setDateRange((prev) => ({ ...prev, startDate: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={dateRange.endDate}
                      onChange={(e) =>
                        setDateRange((prev) => ({ ...prev, endDate: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Active Filters Info */}
          {Object.entries(filters).filter(([_, v]) => v !== undefined).length > 0 && (
            <div className="p-3 bg-surface-hover rounded-lg">
              <p className="text-xs font-medium text-text-muted mb-2">
                Active Filters
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(filters)
                  .filter(([_, v]) => v !== undefined)
                  .map(([key, value]) => (
                    <span
                      key={key}
                      className="text-xs px-2 py-1 bg-accent/10 text-accent rounded"
                    >
                      {key}: {String(value)}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={exportMutation.isPending}
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {exportMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export {formatLabels[format].label}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExportButton({
  exportType,
  filters = {},
  title,
  className = '',
  children,
}: {
  exportType: ExportType;
  filters?: ExportFilters;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={
          className ||
          'px-3 py-2 text-sm bg-surface-hover hover:bg-surface-active border border-border rounded-lg text-text-primary transition-colors flex items-center gap-2'
        }
      >
        {children || (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export
          </>
        )}
      </button>

      <ExportModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        exportType={exportType}
        filters={filters}
        title={title}
      />
    </>
  );
}
