'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ExportButton } from '@/components/admin/ExportModal';

type AuditAction =
  | 'user.update'
  | 'user.sanction'
  | 'user.verify'
  | 'content.remove'
  | 'content.restore'
  | 'content.feature'
  | 'report.action'
  | 'report.dismiss'
  | 'admin.add'
  | 'admin.remove'
  | 'admin.update'
  | 'config.update';

export default function AdminAuditPage() {
  const [actionFilter, setActionFilter] = useState<string>('');
  const [adminFilter, setAdminFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', actionFilter, adminFilter, page],
    queryFn: () =>
      api.getAuditLog({
        action: actionFilter || undefined,
        adminDid: adminFilter || undefined,
        limit: 50,
        offset: (page - 1) * 50,
      }),
  });

  const logs = data?.logs || [];

  const actionColors: Record<string, string> = {
    'user.update': 'bg-blue-500/10 text-blue-500',
    'user.sanction': 'bg-red-500/10 text-red-500',
    'user.verify': 'bg-green-500/10 text-green-500',
    'content.remove': 'bg-orange-500/10 text-orange-500',
    'content.restore': 'bg-teal-500/10 text-teal-500',
    'content.feature': 'bg-purple-500/10 text-purple-500',
    'report.action': 'bg-yellow-500/10 text-yellow-500',
    'report.dismiss': 'bg-gray-500/10 text-gray-400',
    'admin.add': 'bg-indigo-500/10 text-indigo-500',
    'admin.remove': 'bg-red-500/10 text-red-500',
    'admin.update': 'bg-blue-500/10 text-blue-500',
    'config.update': 'bg-cyan-500/10 text-cyan-500',
  };

  const actionLabels: Record<string, string> = {
    'user.update': 'User Updated',
    'user.sanction': 'User Sanctioned',
    'user.verify': 'User Verified',
    'content.remove': 'Content Removed',
    'content.restore': 'Content Restored',
    'content.feature': 'Content Featured',
    'report.action': 'Report Actioned',
    'report.dismiss': 'Report Dismissed',
    'admin.add': 'Admin Added',
    'admin.remove': 'Admin Removed',
    'admin.update': 'Admin Updated',
    'config.update': 'Config Updated',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Audit Log</h1>
        <ExportButton
          exportType="auditLogs"
          filters={{
            action: actionFilter || undefined,
            actorDid: adminFilter || undefined,
          }}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Action Type</label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">All Actions</option>
            <optgroup label="User Actions">
              <option value="user.update">User Updated</option>
              <option value="user.sanction">User Sanctioned</option>
              <option value="user.verify">User Verified</option>
            </optgroup>
            <optgroup label="Content Actions">
              <option value="content.remove">Content Removed</option>
              <option value="content.restore">Content Restored</option>
              <option value="content.feature">Content Featured</option>
            </optgroup>
            <optgroup label="Report Actions">
              <option value="report.action">Report Actioned</option>
              <option value="report.dismiss">Report Dismissed</option>
            </optgroup>
            <optgroup label="Admin Actions">
              <option value="admin.add">Admin Added</option>
              <option value="admin.remove">Admin Removed</option>
              <option value="admin.update">Admin Updated</option>
            </optgroup>
            <optgroup label="System">
              <option value="config.update">Config Updated</option>
            </optgroup>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Admin DID</label>
          <input
            type="text"
            value={adminFilter}
            onChange={(e) => {
              setAdminFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by admin..."
            className="px-3 py-2 bg-surface border border-border rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Admin
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Target
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                  Loading...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-text-muted">
                  No audit logs found
                </td>
              </tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-text-primary">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-text-muted">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        actionColors[log.action] || 'bg-gray-500/10 text-gray-400'
                      }`}
                    >
                      {actionLabels[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {log.admin?.avatar ? (
                        <img
                          src={log.admin.avatar}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center text-text-muted text-xs">
                          {log.admin?.handle?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="text-sm text-text-primary">
                        @{log.admin?.handle || 'unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {log.targetType === 'user' && log.targetUser ? (
                      <div className="flex items-center gap-2">
                        {log.targetUser.avatar ? (
                          <img
                            src={log.targetUser.avatar}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-surface-hover flex items-center justify-center text-text-muted text-xs">
                            {log.targetUser.handle?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <span className="text-sm text-text-primary">
                          @{log.targetUser.handle}
                        </span>
                      </div>
                    ) : log.targetType === 'content' ? (
                      <span className="text-sm text-text-muted font-mono truncate max-w-[200px] block">
                        {log.targetId}
                      </span>
                    ) : log.targetType === 'report' ? (
                      <span className="text-sm text-text-muted">
                        Report #{log.targetId?.slice(-8)}
                      </span>
                    ) : log.targetType === 'config' ? (
                      <span className="text-sm text-text-muted">{log.targetId}</span>
                    ) : (
                      <span className="text-sm text-text-muted">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <AuditDetails details={log.details} action={log.action} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {logs.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {(page - 1) * 50 + 1} - {(page - 1) * 50 + logs.length} entries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm bg-surface-hover hover:bg-border text-text-primary rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={logs.length < 50}
              className="px-3 py-1 text-sm bg-surface-hover hover:bg-border text-text-primary rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditDetails({ details, action }: { details: any; action: string }) {
  if (!details) return <span className="text-text-muted text-sm">-</span>;

  // Parse details if it's a string
  const data = typeof details === 'string' ? JSON.parse(details) : details;

  if (action === 'user.sanction' && data.sanctionType) {
    return (
      <div className="text-sm">
        <span className="text-text-primary capitalize">{data.sanctionType}</span>
        {data.reason && (
          <p className="text-text-muted text-xs truncate max-w-[200px]">{data.reason}</p>
        )}
      </div>
    );
  }

  if (action === 'user.verify') {
    return (
      <span className="text-sm text-text-primary">
        {data.verified ? 'Verified' : 'Unverified'}
      </span>
    );
  }

  if (action === 'admin.add' || action === 'admin.update') {
    return (
      <span className="text-sm text-text-primary capitalize">
        Role: {data.role || 'unknown'}
      </span>
    );
  }

  if (action === 'report.action' && data.actionTaken) {
    return (
      <span className="text-sm text-text-primary capitalize">{data.actionTaken}</span>
    );
  }

  if (action === 'config.update') {
    return (
      <div className="text-sm">
        <span className="text-text-muted">→ </span>
        <span className="text-text-primary font-mono text-xs">
          {typeof data.newValue === 'object' ? JSON.stringify(data.newValue) : String(data.newValue)}
        </span>
      </div>
    );
  }

  // Generic fallback
  const keys = Object.keys(data).slice(0, 2);
  if (keys.length === 0) return <span className="text-text-muted text-sm">-</span>;

  return (
    <div className="text-sm text-text-muted">
      {keys.map((key) => (
        <div key={key} className="truncate max-w-[200px]">
          <span className="text-text-muted">{key}: </span>
          <span className="text-text-primary">
            {typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key])}
          </span>
        </div>
      ))}
    </div>
  );
}
