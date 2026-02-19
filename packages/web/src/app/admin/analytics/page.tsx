'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';

export default function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.getAdminDashboard(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-24 bg-surface rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const rawStats = data?.stats;
  const stats = {
    totalUsers: rawStats?.totalUsers ?? 0,
    totalVideos: rawStats?.totalVideos ?? 0,
    pendingReports: rawStats?.pendingReports ?? 0,
    newUsersToday: rawStats?.newUsersToday ?? 0,
    newVideosToday: rawStats?.newVideosToday ?? 0,
    totalViews: rawStats?.totalViews ?? 0,
    totalLikes: rawStats?.totalLikes ?? 0,
    newUsersWeek: rawStats?.newUsersWeek ?? 0,
    newVideosWeek: rawStats?.newVideosWeek ?? 0,
    totalComments: rawStats?.totalComments ?? 0,
    actionedReports: rawStats?.actionedReports ?? 0,
    dismissedReports: rawStats?.dismissedReports ?? 0,
  };
  const topVideos = data?.topVideos || [];
  const topCreators = data?.topCreators || [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={formatCount(stats.totalUsers)}
          subtext={`+${stats.newUsersToday} today`}
          color="blue"
        />
        <StatCard
          label="Total Videos"
          value={formatCount(stats.totalVideos)}
          subtext={`+${stats.newVideosToday} today`}
          color="purple"
        />
        <StatCard
          label="Total Views"
          value={formatCount(stats.totalViews)}
          color="green"
        />
        <StatCard
          label="Total Likes"
          value={formatCount(stats.totalLikes)}
          color="pink"
        />
      </div>

      {/* Growth Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-text-muted mb-4">This Week</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">New Users</span>
              <span className="text-text-primary font-semibold">+{stats.newUsersWeek}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">New Videos</span>
              <span className="text-text-primary font-semibold">+{stats.newVideosWeek}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Comments</span>
              <span className="text-text-primary font-semibold">{formatCount(stats.totalComments)}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-text-muted mb-4">Moderation</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Pending Reports</span>
              <span className="text-accent font-semibold">{stats.pendingReports}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Actioned</span>
              <span className="text-green-500 font-semibold">{stats.actionedReports}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Dismissed</span>
              <span className="text-text-muted font-semibold">{stats.dismissedReports}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-text-muted mb-4">Engagement</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Avg Views/Video</span>
              <span className="text-text-primary font-semibold">
                {stats.totalVideos > 0
                  ? formatCount(Math.round(stats.totalViews / stats.totalVideos))
                  : '0'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Avg Likes/Video</span>
              <span className="text-text-primary font-semibold">
                {stats.totalVideos > 0
                  ? formatCount(Math.round(stats.totalLikes / stats.totalVideos))
                  : '0'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Like Rate</span>
              <span className="text-text-primary font-semibold">
                {stats.totalViews > 0
                  ? ((stats.totalLikes / stats.totalViews) * 100).toFixed(1)
                  : '0'}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Videos */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Top Videos</h3>
          <div className="space-y-3">
            {topVideos.length === 0 ? (
              <p className="text-text-muted text-sm">No videos yet</p>
            ) : (
              topVideos.map((video: any, index: number) => (
                <div key={video.uri} className="flex items-center gap-3">
                  <span className="text-text-muted font-medium w-6">{index + 1}</span>
                  <div className="w-16 h-10 rounded bg-surface-hover overflow-hidden flex-shrink-0">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VideoIcon className="w-4 h-4 text-text-muted" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      {video.caption || 'Untitled'}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatCount(video.viewCount)} views
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Creators */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Top Creators</h3>
          <div className="space-y-3">
            {topCreators.length === 0 ? (
              <p className="text-text-muted text-sm">No creators yet</p>
            ) : (
              topCreators.map((creator: any, index: number) => (
                <div key={creator.did} className="flex items-center gap-3">
                  <span className="text-text-muted font-medium w-6">{index + 1}</span>
                  <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                    {creator.avatar ? (
                      <img
                        src={creator.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                        {creator.handle[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate flex items-center gap-1">
                      {creator.displayName || creator.handle}
                      {creator.verified && <VerifiedIcon className="w-3 h-3 text-accent" />}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatCount(creator.followerCount)} followers
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  color: 'blue' | 'purple' | 'green' | 'pink';
}

function StatCard({ label, value, subtext, color }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-500/10 text-blue-500',
    purple: 'bg-purple-500/10 text-purple-500',
    green: 'bg-green-500/10 text-green-500',
    pink: 'bg-pink-500/10 text-pink-500',
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <p className="text-sm text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      {subtext && (
        <p className={`text-xs mt-1 ${colors[color]}`}>{subtext}</p>
      )}
    </div>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
