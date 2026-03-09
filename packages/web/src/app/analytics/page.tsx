'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { LineChart, BarChart, DoughnutChart } from '@/components/analytics';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type Tab = 'overview' | 'videos' | 'followers' | 'streams' | 'earnings';
type Period = '7d' | '30d' | '90d' | 'all';

interface OverviewData {
  period: string;
  profile: {
    totalFollowers: number;
    totalFollowing: number;
    totalVideos: number;
  };
  metrics: {
    views: number;
    likes: number;
    comments: number;
    newFollowers: number;
    reposts: number;
    shares: number;
  };
  earnings: {
    totalEarnings: number;
    availableBalance: number;
    pendingBalance: number;
    currency: string;
    lastPayoutAt: string | null;
  } | null;
}

interface VideoAnalytics {
  id: string;
  caption: string;
  thumbnailUrl: string;
  duration: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  engagementRate: number;
}

interface FollowerGrowth {
  date: string;
  count: number;
}

interface StreamAnalytics {
  id: string;
  title: string;
  status: string;
  viewerCount: number;
  peakViewers: number;
  totalViews: number;
  thumbnailUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('30d');

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-text-primary mb-2">Sign in to view analytics</h1>
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Creator Analytics</h1>
            <p className="text-text-muted text-sm mt-1">
              Track your content performance and audience growth
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  period === p
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface text-text-muted hover:text-text-primary'
                }`}
              >
                {p === 'all' ? 'All Time' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-border pb-px mb-6">
          {[
            { id: 'overview' as Tab, label: 'Overview' },
            { id: 'videos' as Tab, label: 'Videos' },
            { id: 'followers' as Tab, label: 'Followers' },
            { id: 'streams' as Tab, label: 'Live Streams' },
            { id: 'earnings' as Tab, label: 'Earnings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && <OverviewTab period={period} />}
        {activeTab === 'videos' && <VideosTab />}
        {activeTab === 'followers' && <FollowersTab period={period} />}
        {activeTab === 'streams' && <StreamsTab period={period} />}
        {activeTab === 'earnings' && <EarningsTab />}
      </div>
    </div>
  );
}

// ============================================================================
// Overview Tab
// ============================================================================

function OverviewTab({ period }: { period: Period }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'overview', period],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.analytics.overview?period=${period}`);
      return response.json() as Promise<OverviewData>;
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <p className="text-text-muted text-center py-8">No data available</p>;
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-6">
      {/* Profile Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Followers"
          value={formatNumber(data.profile.totalFollowers)}
          icon={<UsersIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Total Videos"
          value={formatNumber(data.profile.totalVideos)}
          icon={<VideoIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Following"
          value={formatNumber(data.profile.totalFollowing)}
          icon={<HeartIcon className="w-5 h-5" />}
        />
      </div>

      {/* Period Metrics */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Performance ({period === 'all' ? 'All Time' : `Last ${period}`})
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard label="Views" value={formatNumber(data.metrics.views)} color="accent" />
          <MetricCard label="Likes" value={formatNumber(data.metrics.likes)} color="red" />
          <MetricCard label="Comments" value={formatNumber(data.metrics.comments)} color="blue" />
          <MetricCard label="New Followers" value={formatNumber(data.metrics.newFollowers)} color="green" />
          <MetricCard label="Reposts" value={formatNumber(data.metrics.reposts)} color="purple" />
          <MetricCard label="Shares" value={formatNumber(data.metrics.shares)} color="yellow" />
        </div>
      </div>

      {/* Engagement Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Engagement Breakdown</h3>
          <DoughnutChart
            labels={['Likes', 'Comments', 'Shares', 'Reposts']}
            data={[
              data.metrics.likes,
              data.metrics.comments,
              data.metrics.shares,
              data.metrics.reposts,
            ]}
            centerLabel={{
              text: formatNumber(
                data.metrics.likes +
                  data.metrics.comments +
                  data.metrics.shares +
                  data.metrics.reposts
              ),
              subtext: 'Total',
            }}
          />
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Views vs Engagement</h3>
          <BarChart
            labels={['Views', 'Likes', 'Comments', 'Shares']}
            datasets={[
              {
                label: 'Count',
                data: [
                  data.metrics.views,
                  data.metrics.likes,
                  data.metrics.comments,
                  data.metrics.shares,
                ],
              },
            ]}
            height={200}
            showLegend={false}
          />
        </div>
      </div>

      {/* Earnings Summary */}
      {data.earnings && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Earnings</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">
                ${data.earnings.totalEarnings.toFixed(2)}
              </p>
              <p className="text-sm text-text-muted">Total Earnings</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-accent">
                ${data.earnings.availableBalance.toFixed(2)}
              </p>
              <p className="text-sm text-text-muted">Available</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-yellow-500">
                ${data.earnings.pendingBalance.toFixed(2)}
              </p>
              <p className="text-sm text-text-muted">Pending</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Videos Tab
// ============================================================================

function VideosTab() {
  const [sortBy, setSortBy] = useState<'recent' | 'views' | 'likes' | 'comments'>('recent');

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'videos', sortBy],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.analytics.videos?sortBy=${sortBy}&limit=20`);
      return response.json();
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const videos: VideoAnalytics[] = data?.videos || [];

  return (
    <div className="space-y-4">
      {/* Sort Options */}
      <div className="flex gap-2">
        {[
          { id: 'recent', label: 'Most Recent' },
          { id: 'views', label: 'Most Views' },
          { id: 'likes', label: 'Most Likes' },
          { id: 'comments', label: 'Most Comments' },
        ].map((option) => (
          <button
            key={option.id}
            onClick={() => setSortBy(option.id as typeof sortBy)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              sortBy === option.id
                ? 'bg-accent text-text-inverse'
                : 'bg-surface text-text-muted hover:text-text-primary'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Videos List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {videos.length === 0 ? (
          <p className="text-text-muted text-center py-8">No videos found</p>
        ) : (
          <div className="divide-y divide-border">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-4 p-4 hover:bg-surface-hover/50 transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-24 h-16 bg-surface-hover rounded-lg overflow-hidden flex-shrink-0">
                  {video.thumbnailUrl ? (
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoIcon className="w-6 h-6 text-text-muted" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium truncate">
                    {video.caption || 'Untitled'}
                  </p>
                  <p className="text-xs text-text-muted">
                    {new Date(video.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Metrics */}
                <div className="flex gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-semibold text-text-primary">{formatCompact(video.viewCount)}</p>
                    <p className="text-xs text-text-muted">Views</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-text-primary">{formatCompact(video.likeCount)}</p>
                    <p className="text-xs text-text-muted">Likes</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-text-primary">{formatCompact(video.commentCount)}</p>
                    <p className="text-xs text-text-muted">Comments</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-accent">{video.engagementRate.toFixed(1)}%</p>
                    <p className="text-xs text-text-muted">Engagement</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Followers Tab
// ============================================================================

function FollowersTab({ period }: { period: Period }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'followers', period],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.analytics.followers?period=${period}`);
      return response.json();
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const totalFollowers = data?.totalFollowers || 0;
  const growth: FollowerGrowth[] = data?.growth || [];
  const recentFollowers = data?.recentFollowers || [];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Total Followers"
          value={formatCompact(totalFollowers)}
          icon={<UsersIcon className="w-5 h-5" />}
        />
        <StatCard
          label={`New (${period === 'all' ? 'All Time' : `${period}`})`}
          value={formatCompact(growth.reduce((sum, g) => sum + g.count, 0))}
          icon={<TrendingUpIcon className="w-5 h-5" />}
        />
      </div>

      {/* Growth Chart */}
      {growth.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Follower Growth</h3>
          <LineChart
            labels={growth.slice(-30).map((g) => {
              const date = new Date(g.date);
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            })}
            datasets={[
              {
                label: 'New Followers',
                data: growth.slice(-30).map((g) => g.count),
                fill: true,
              },
            ]}
            height={200}
            showLegend={false}
          />
        </div>
      )}

      {/* Recent Followers */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">Recent Followers</h3>
        </div>
        {recentFollowers.length === 0 ? (
          <p className="text-text-muted text-center py-8">No recent followers</p>
        ) : (
          <div className="divide-y divide-border">
            {recentFollowers.map((follower: any) => (
              <div
                key={follower.did}
                className="flex items-center gap-4 p-4 hover:bg-surface-hover/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden">
                  {follower.avatar ? (
                    <img src={follower.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                      <UsersIcon className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text-primary">
                    {follower.displayName || follower.handle}
                  </p>
                  <p className="text-sm text-text-muted">@{follower.handle}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-text-muted">
                    {formatCompact(follower.followerCount)} followers
                  </p>
                  <p className="text-xs text-text-muted">
                    {new Date(follower.followedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Streams Tab
// ============================================================================

function StreamsTab({ period }: { period: Period }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'streams', period],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.analytics.streams?period=${period}`);
      return response.json();
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const summary = data?.summary || {
    totalStreams: 0,
    totalViews: 0,
    avgPeakViewers: 0,
    avgDurationSeconds: 0,
  };
  const recentStreams: StreamAnalytics[] = data?.recentStreams || [];

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Streams"
          value={summary.totalStreams.toString()}
          icon={<LiveIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Total Views"
          value={formatCompact(summary.totalViews)}
          icon={<EyeIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Avg Peak Viewers"
          value={formatCompact(summary.avgPeakViewers)}
          icon={<UsersIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Avg Duration"
          value={formatDuration(summary.avgDurationSeconds)}
          icon={<ClockIcon className="w-5 h-5" />}
        />
      </div>

      {/* Recent Streams */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-surface-hover border-b border-border">
          <h3 className="font-semibold text-text-primary">Recent Streams</h3>
        </div>
        {recentStreams.length === 0 ? (
          <p className="text-text-muted text-center py-8">No streams found</p>
        ) : (
          <div className="divide-y divide-border">
            {recentStreams.map((stream) => (
              <div
                key={stream.id}
                className="flex items-center gap-4 p-4 hover:bg-surface-hover/50 transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-32 h-20 bg-surface-hover rounded-lg overflow-hidden flex-shrink-0">
                  {stream.thumbnailUrl ? (
                    <img
                      src={stream.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <LiveIcon className="w-8 h-8 text-text-muted" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-text-primary font-medium truncate">{stream.title}</p>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        stream.status === 'live'
                          ? 'bg-red-500/10 text-red-500'
                          : stream.status === 'ended'
                          ? 'bg-gray-500/10 text-gray-500'
                          : 'bg-yellow-500/10 text-yellow-500'
                      }`}
                    >
                      {stream.status}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    {stream.startedAt && new Date(stream.startedAt).toLocaleDateString()}
                    {stream.durationSeconds && ` · ${formatDuration(stream.durationSeconds)}`}
                  </p>
                </div>

                {/* Metrics */}
                <div className="flex gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-semibold text-text-primary">{formatCompact(stream.peakViewers)}</p>
                    <p className="text-xs text-text-muted">Peak</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-text-primary">{formatCompact(stream.totalViews)}</p>
                    <p className="text-xs text-text-muted">Views</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Earnings Tab
// ============================================================================

function EarningsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'earnings'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/xrpc/io.exprsn.analytics.earnings`);
      return response.json();
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const earnings = data?.earnings || {
    totalEarnings: 0,
    availableBalance: 0,
    pendingBalance: 0,
    currency: 'usd',
    lastPayoutAt: null,
    lastPayoutAmount: null,
  };

  return (
    <div className="space-y-6">
      {/* Balance Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
          <p className="text-4xl font-bold text-green-500">
            ${earnings.totalEarnings.toFixed(2)}
          </p>
          <p className="text-sm text-green-400 mt-1">Total Earnings</p>
        </div>
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-6 text-center">
          <p className="text-4xl font-bold text-accent">
            ${earnings.availableBalance.toFixed(2)}
          </p>
          <p className="text-sm text-accent/80 mt-1">Available Balance</p>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 text-center">
          <p className="text-4xl font-bold text-yellow-500">
            ${earnings.pendingBalance.toFixed(2)}
          </p>
          <p className="text-sm text-yellow-400 mt-1">Pending</p>
        </div>
      </div>

      {/* Payout Info */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Payout Information</h3>
        <div className="space-y-4">
          {earnings.lastPayoutAt ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary">Last Payout</p>
                <p className="text-sm text-text-muted">
                  {new Date(earnings.lastPayoutAt).toLocaleDateString()}
                </p>
              </div>
              <p className="text-xl font-semibold text-green-500">
                ${earnings.lastPayoutAmount?.toFixed(2) || '0.00'}
              </p>
            </div>
          ) : (
            <p className="text-text-muted">No payouts yet</p>
          )}
          <Link
            href="/settings/monetization"
            className="inline-block px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Manage Payout Settings
          </Link>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
        <h3 className="font-semibold text-blue-400 mb-2">How Earnings Work</h3>
        <ul className="text-sm text-blue-300 space-y-1 list-disc list-inside">
          <li>Earnings are calculated based on video views and engagement</li>
          <li>Pending balance becomes available after a 30-day holding period</li>
          <li>Minimum payout threshold is $25</li>
          <li>Payouts are processed weekly on Fridays</li>
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function LoadingSpinner() {
  return (
    <div className="p-12 text-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center text-accent">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          <p className="text-sm text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    accent: 'text-accent',
    red: 'text-red-500',
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    yellow: 'text-yellow-500',
  };

  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${colorClasses[color] || 'text-text-primary'}`}>
        {value}
      </p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </div>
  );
}

function formatCompact(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// ============================================================================
// Icons
// ============================================================================

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function LiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
