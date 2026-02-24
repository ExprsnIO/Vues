'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, AdminActivityItem } from '@/lib/api';

type ActionFilter = '' | 'user' | 'content' | 'report' | 'admin' | 'config' | 'export';

const actionLabels: Record<string, { label: string; color: string }> = {
  'user.update': { label: 'User Updated', color: 'bg-blue-500/10 text-blue-500' },
  'user.sanction': { label: 'User Sanctioned', color: 'bg-red-500/10 text-red-500' },
  'user.verify': { label: 'User Verified', color: 'bg-green-500/10 text-green-500' },
  'user.unverify': { label: 'User Unverified', color: 'bg-yellow-500/10 text-yellow-500' },
  'user.bulkSanction': { label: 'Bulk Sanction', color: 'bg-red-500/10 text-red-500' },
  'content.remove': { label: 'Content Removed', color: 'bg-orange-500/10 text-orange-500' },
  'content.restore': { label: 'Content Restored', color: 'bg-teal-500/10 text-teal-500' },
  'content.feature': { label: 'Content Featured', color: 'bg-purple-500/10 text-purple-500' },
  'report.action': { label: 'Report Actioned', color: 'bg-yellow-500/10 text-yellow-500' },
  'report.dismiss': { label: 'Report Dismissed', color: 'bg-gray-500/10 text-gray-400' },
  'admin.add': { label: 'Admin Added', color: 'bg-indigo-500/10 text-indigo-500' },
  'admin.remove': { label: 'Admin Removed', color: 'bg-red-500/10 text-red-500' },
  'admin.update': { label: 'Admin Updated', color: 'bg-blue-500/10 text-blue-500' },
  'config.update': { label: 'Config Updated', color: 'bg-cyan-500/10 text-cyan-500' },
  'export': { label: 'Data Exported', color: 'bg-violet-500/10 text-violet-500' },
};

function getActionLabel(action: string): { label: string; color: string } {
  // Check for exact match first
  if (actionLabels[action]) return actionLabels[action];

  // Check for prefix match
  for (const [prefix, value] of Object.entries(actionLabels)) {
    if (action.startsWith(prefix)) return value;
  }

  // Default
  return { label: action, color: 'bg-gray-500/10 text-gray-400' };
}

export default function AdminActivityPage() {
  const [actionFilter, setActionFilter] = useState<ActionFilter>('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'activity', actionFilter, page],
    queryFn: () =>
      api.getAdminActivityFeed({
        action: actionFilter || undefined,
        limit,
        offset: page * limit,
      }),
  });

  const activities = data?.activities || [];
  const hasMore = data?.pagination?.hasMore || false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Admin Activity</h1>
          <p className="text-text-muted mt-1">Track all administrative actions</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setActionFilter('');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            actionFilter === ''
              ? 'bg-accent text-text-inverse'
              : 'bg-surface-hover text-text-primary hover:bg-border'
          }`}
        >
          All
        </button>
        <button
          onClick={() => {
            setActionFilter('user');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            actionFilter === 'user'
              ? 'bg-accent text-text-inverse'
              : 'bg-surface-hover text-text-primary hover:bg-border'
          }`}
        >
          User Actions
        </button>
        <button
          onClick={() => {
            setActionFilter('content');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            actionFilter === 'content'
              ? 'bg-accent text-text-inverse'
              : 'bg-surface-hover text-text-primary hover:bg-border'
          }`}
        >
          Content
        </button>
        <button
          onClick={() => {
            setActionFilter('report');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            actionFilter === 'report'
              ? 'bg-accent text-text-inverse'
              : 'bg-surface-hover text-text-primary hover:bg-border'
          }`}
        >
          Reports
        </button>
        <button
          onClick={() => {
            setActionFilter('admin');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            actionFilter === 'admin'
              ? 'bg-accent text-text-inverse'
              : 'bg-surface-hover text-text-primary hover:bg-border'
          }`}
        >
          Admin
        </button>
        <button
          onClick={() => {
            setActionFilter('export');
            setPage(0);
          }}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            actionFilter === 'export'
              ? 'bg-accent text-text-inverse'
              : 'bg-surface-hover text-text-primary hover:bg-border'
          }`}
        >
          Exports
        </button>
      </div>

      {/* Activity List */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">
            Loading activity...
          </div>
        ) : activities.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">
            No activity found
          </div>
        ) : (
          activities.map((group) => (
            <div key={group.date} className="space-y-3">
              <h3 className="text-sm font-medium text-text-muted sticky top-0 bg-background py-2">
                {formatDate(group.date)}
              </h3>
              <div className="bg-surface border border-border rounded-xl divide-y divide-border">
                {group.items.map((item: AdminActivityItem) => (
                  <ActivityItem key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {(page > 0 || hasMore) && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-text-muted">Page {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasMore}
            className="px-4 py-2 text-sm bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityItem({ item }: { item: AdminActivityItem }) {
  const { label, color } = getActionLabel(item.action);

  return (
    <div className="p-4 hover:bg-surface-hover transition-colors">
      <div className="flex items-start gap-4">
        {/* Admin Avatar */}
        <div className="flex-shrink-0">
          {item.admin.avatar ? (
            <img
              src={item.admin.avatar}
              alt=""
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted font-medium">
              {item.admin.handle?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-text-primary">
              @{item.admin.handle || 'Unknown'}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${color}`}>
              {label}
            </span>
            <span className="text-xs px-1.5 py-0.5 bg-surface-hover text-text-muted rounded capitalize">
              {item.admin.role?.replace('_', ' ')}
            </span>
          </div>

          {/* Target info */}
          {item.targetType && (
            <p className="text-sm text-text-muted mt-1">
              Target: <span className="text-text-secondary">{item.targetType}</span>
              {item.targetId && (
                <span className="font-mono text-xs ml-1 text-text-muted">
                  {item.targetId.length > 30
                    ? `${item.targetId.slice(0, 30)}...`
                    : item.targetId}
                </span>
              )}
            </p>
          )}

          {/* Details */}
          {item.details && Object.keys(item.details).length > 0 && (
            <div className="mt-2 p-2 bg-surface-hover rounded text-xs text-text-muted">
              {Object.entries(item.details)
                .filter(([_, v]) => v !== undefined && v !== null)
                .slice(0, 3)
                .map(([key, value]) => (
                  <div key={key}>
                    <span className="text-text-secondary">{key}:</span>{' '}
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div className="flex-shrink-0 text-xs text-text-muted">
          {new Date(item.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }
}
