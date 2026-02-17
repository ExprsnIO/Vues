'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.getAdminDashboard(),
  });

  if (isLoading) {
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

  const stats = data?.stats || { totalUsers: 0, totalVideos: 0, pendingReports: 0 };
  const recentActivity = data?.recentActivity || { users: [], videos: [] };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Total Users"
          value={formatCount(stats.totalUsers)}
          icon={UsersIcon}
          href="/admin/users"
        />
        <StatCard
          label="Total Videos"
          value={formatCount(stats.totalVideos)}
          icon={VideosIcon}
          href="/admin/content"
        />
        <StatCard
          label="Pending Reports"
          value={stats.pendingReports.toString()}
          icon={ReportsIcon}
          href="/admin/reports"
          highlight={stats.pendingReports > 0}
        />
      </div>

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
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  href: string;
  highlight?: boolean;
}

function StatCard({ label, value, icon: Icon, href, highlight }: StatCardProps) {
  return (
    <Link
      href={href}
      className={`block bg-surface border rounded-xl p-6 hover:border-accent transition-colors ${
        highlight ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted mb-1">{label}</p>
          <p className={`text-3xl font-bold ${highlight ? 'text-accent' : 'text-text-primary'}`}>
            {value}
          </p>
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-accent/10' : 'bg-surface-hover'}`}>
          <Icon className={`w-6 h-6 ${highlight ? 'text-accent' : 'text-text-muted'}`} />
        </div>
      </div>
    </Link>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
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
