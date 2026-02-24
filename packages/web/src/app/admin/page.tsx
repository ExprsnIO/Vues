'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { useAdminSocket, type AdminNotification } from '@/hooks/useAdminSocket';
import toast from 'react-hot-toast';
import { useEffect } from 'react';

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.getAdminDashboard(),
  });

  // Real-time WebSocket connection
  const {
    stats: realtimeStats,
    notifications,
    connectedAdmins,
    isConnected,
    clearNotifications,
  } = useAdminSocket({
    onNotification: (notification) => {
      // Show toast for new notifications
      const toastType =
        notification.severity === 'error'
          ? toast.error
          : notification.severity === 'warning'
          ? toast.error
          : notification.severity === 'success'
          ? toast.success
          : toast;
      toastType(notification.message, { id: notification.id });
    },
  });

  // Use real-time stats if available, fallback to API data
  const stats = realtimeStats || data?.stats || {
    totalUsers: 0,
    totalVideos: 0,
    pendingReports: 0,
    activeUsers: 0,
    newUsersToday: 0,
    activeRenderJobs: 0,
    queuedRenderJobs: 0,
  };
  const recentActivity = data?.recentActivity || { users: [], videos: [] };

  if (isLoading && !realtimeStats) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with connection status */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <div className="flex items-center gap-4">
          {/* Online Admins */}
          {connectedAdmins.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-hover rounded-lg">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-text-muted">
                {connectedAdmins.length} admin{connectedAdmins.length !== 1 ? 's' : ''} online
              </span>
            </div>
          )}
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
              }`}
            />
            <span className="text-xs text-text-muted">
              {isConnected ? 'Live' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* System Health */}
      {realtimeStats?.systemHealth && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-text-muted mb-3">System Health</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(realtimeStats.systemHealth).map(([service, status]) => (
              <div key={service} className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    status === 'healthy'
                      ? 'bg-green-500'
                      : status === 'degraded'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                />
                <span className="text-sm text-text-primary capitalize">{service}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={formatCount(stats.totalUsers)}
          subValue={stats.newUsersToday ? `+${stats.newUsersToday} today` : undefined}
          icon={UsersIcon}
          href="/admin/users"
        />
        <StatCard
          label="Active Users"
          value={formatCount(stats.activeUsers || 0)}
          subValue="online now"
          icon={ActivityIcon}
          href="/admin/analytics"
          live
        />
        <StatCard
          label="Pending Reports"
          value={stats.pendingReports?.toString() || '0'}
          icon={ReportsIcon}
          href="/admin/reports"
          highlight={(stats.pendingReports || 0) > 0}
        />
        <StatCard
          label="Render Jobs"
          value={`${stats.activeRenderJobs || 0} / ${stats.queuedRenderJobs || 0}`}
          subValue="active / queued"
          icon={RenderIcon}
          href="/admin/render"
          live
        />
      </div>

      {/* Notifications Panel */}
      {notifications.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              Recent Notifications
            </h2>
            <button
              onClick={clearNotifications}
              className="text-sm text-text-muted hover:text-text-primary"
            >
              Clear all
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {notifications.slice(0, 10).map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Users */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Recent Users</h2>
            <Link href="/admin/users" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentActivity.users.length === 0 ? (
              <p className="text-text-muted text-sm">No recent users</p>
            ) : (
              recentActivity.users.map((user: any) => (
                <div key={user.did} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover">
                  <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted font-semibold">
                    {user.handle[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      @{user.handle}
                    </p>
                    <p className="text-xs text-text-muted">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Videos */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Recent Videos</h2>
            <Link href="/admin/content" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentActivity.videos.length === 0 ? (
              <p className="text-text-muted text-sm">No recent videos</p>
            ) : (
              recentActivity.videos.map((video: any) => (
                <div key={video.uri} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover">
                  <div className="w-16 h-10 rounded bg-surface-hover flex items-center justify-center">
                    <VideosIcon className="w-5 h-5 text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {video.caption || 'Untitled video'}
                    </p>
                    <p className="text-xs text-text-muted">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Online Admins List */}
      {connectedAdmins.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Online Admins</h2>
          <div className="flex flex-wrap gap-3">
            {connectedAdmins.map((admin) => (
              <div
                key={admin.did}
                className="flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg"
              >
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm text-text-primary">@{admin.handle}</span>
                <span className="text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded capitalize">
                  {admin.role.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/reports"
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Review Reports
          </Link>
          <Link
            href="/admin/users"
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Manage Users
          </Link>
          <Link
            href="/admin/content"
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Moderate Content
          </Link>
          <Link
            href="/admin/render"
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Render Pipeline
          </Link>
          <Link
            href="/admin/organizations"
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Organizations
          </Link>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.FC<{ className?: string }>;
  href: string;
  highlight?: boolean;
  live?: boolean;
}

function StatCard({ label, value, subValue, icon: Icon, href, highlight, live }: StatCardProps) {
  return (
    <Link
      href={href}
      className={`block bg-surface border rounded-xl p-6 hover:border-accent transition-colors ${
        highlight ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm text-text-muted">{label}</p>
            {live && (
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            )}
          </div>
          <p className={`text-3xl font-bold ${highlight ? 'text-accent' : 'text-text-primary'}`}>
            {value}
          </p>
          {subValue && (
            <p className="text-xs text-text-muted mt-1">{subValue}</p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-accent/10' : 'bg-surface-hover'}`}>
          <Icon className={`w-6 h-6 ${highlight ? 'text-accent' : 'text-text-muted'}`} />
        </div>
      </div>
    </Link>
  );
}

function NotificationItem({ notification }: { notification: AdminNotification }) {
  const severityColors = {
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-500',
    warning: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500',
    error: 'bg-red-500/10 border-red-500/20 text-red-500',
    success: 'bg-green-500/10 border-green-500/20 text-green-500',
  };

  return (
    <div
      className={`p-3 rounded-lg border ${severityColors[notification.severity]} bg-opacity-50`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{notification.title}</p>
          <p className="text-xs opacity-80 mt-0.5">{notification.message}</p>
        </div>
        <span className="text-xs opacity-60">
          {new Date(notification.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function VideosIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function RenderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
