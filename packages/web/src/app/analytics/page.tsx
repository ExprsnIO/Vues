'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import Link from 'next/link';
import { LineChart, BarChart as ChartBarChart, DoughnutChart } from '@/components/analytics';

type Period = '7d' | '30d' | '90d' | '1y';
type Tab = 'overview' | 'videos' | 'audience' | 'engagement';
type SortCol = 'createdAt' | 'viewCount' | 'likeCount' | 'commentCount' | 'shareCount' | 'engagementRate';
type SortDir = 'asc' | 'desc';

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
];

function formatCompact(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── CSS Bar Chart ────────────────────────────────────────────────────────────

function CssBarChart({
  data,
  height = 120,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
          <div
            className="w-full bg-accent/70 hover:bg-accent rounded-t-sm transition-all cursor-default"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
          />
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-surface border border-border text-text-primary text-[10px] px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 shadow-lg">
            {formatCompact(d.value)}
          </div>
          <span className="text-[8px] text-text-muted leading-none truncate w-full text-center">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  trend?: { value: string; positive: boolean } | null;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-sm">{label}</span>
        <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center text-accent">
          {icon}
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
      </div>
      {trend && (
        <div
          className={`text-xs font-medium flex items-center gap-1 ${
            trend.positive ? 'text-green-500' : 'text-red-400'
          }`}
        >
          {trend.positive ? (
            <TrendUpIcon className="w-3 h-3" />
          ) : (
            <TrendDownIcon className="w-3 h-3" />
          )}
          {trend.value}
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`bg-surface-hover animate-pulse rounded ${className}`} />;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyAnalytics() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mb-4">
        <ChartBarIcon className="w-8 h-8 text-text-muted" />
      </div>
      <h2 className="text-xl font-semibold text-text-primary mb-2">
        Start creating to see your analytics
      </h2>
      <p className="text-text-muted text-sm mb-6 max-w-sm">
        Upload your first video to start tracking views, likes, and follower growth.
      </p>
      <Link
        href="/upload"
        className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg font-medium transition-colors"
      >
        Upload a Video
      </Link>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ period }: { period: Period }) {
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview', period],
    queryFn: () => api.getCreatorAnalyticsOverview(period),
    retry: 1,
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['analytics', 'trends', period],
    queryFn: () => api.getCreatorContentTrends(period),
    retry: 1,
  });

  const { data: topVideosData, isLoading: topVideosLoading } = useQuery({
    queryKey: ['analytics', 'top-videos', period],
    queryFn: () => api.getCreatorVideoPerformance({ period, sortBy: 'views', limit: 5 }),
    retry: 1,
  });

  const { data: earningsData } = useQuery({
    queryKey: ['analytics', 'earnings'],
    queryFn: () => api.getCreatorEarnings(),
    retry: 1,
  });

  if (overviewLoading || trendsLoading) return <OverviewSkeleton />;

  const overview = overviewData?.overview;
  if (!overview || (overview.totalVideos === 0 && overview.totalFollowers === 0)) {
    return <EmptyAnalytics />;
  }

  const dailyViews = trendsData?.dailyStats ?? [];
  const chartData = dailyViews.slice(-30).map((d) => ({
    label: formatDate(d.date).replace(/[A-Z][a-z]+ /, ''),
    value: d.views,
  }));

  const topVideos = topVideosData?.videos ?? [];
  const avgViews = overview.totalVideos > 0
    ? Math.round(overview.totalViews / overview.totalVideos)
    : 0;
  const bestVideo = topVideos[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Views"
          value={formatCompact(overview.totalViews)}
          icon={<EyeIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Followers"
          value={formatCompact(overview.totalFollowers)}
          sub={`${overview.newFollowers > 0 ? '+' : ''}${formatCompact(overview.newFollowers)} this period`}
          icon={<UsersIcon className="w-4 h-4" />}
          trend={
            overview.newFollowers > 0
              ? { value: `+${formatCompact(overview.newFollowers)} new`, positive: true }
              : null
          }
        />
        <StatCard
          label="Engagement Rate"
          value={`${overview.engagementRate.toFixed(2)}%`}
          sub="Likes + comments / views"
          icon={<HeartIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Videos"
          value={formatCompact(overview.totalVideos)}
          sub={`Avg ${formatCompact(avgViews)} views each`}
          icon={<VideoIcon className="w-4 h-4" />}
        />
      </div>

      {/* Views Over Time + Engagement Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-base font-semibold text-text-primary mb-1">Views Over Time</h3>
          <p className="text-xs text-text-muted mb-4">Daily views for the last 30 days</p>
          {chartData.length > 0 ? (
            <CssBarChart data={chartData} height={120} />
          ) : (
            <div className="flex items-center justify-center h-32 text-text-muted text-sm">
              No data for this period
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-base font-semibold text-text-primary mb-1">Engagement Breakdown</h3>
          <p className="text-xs text-text-muted mb-4">Likes, comments, and shares</p>
          <DoughnutChart
            labels={['Likes', 'Comments', 'Shares']}
            data={[overview.totalLikes, overview.totalComments, overview.totalShares]}
            height={180}
            showLegend
            centerLabel={{
              text: formatCompact(
                overview.totalLikes + overview.totalComments + overview.totalShares
              ),
              subtext: 'Total',
            }}
          />
        </div>
      </div>

      {/* Top 5 Videos + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Top Performing Videos</h3>
          </div>
          {topVideosLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : topVideos.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-8">No videos yet</p>
          ) : (
            <ol className="divide-y divide-border">
              {topVideos.slice(0, 5).map((video, idx) => (
                <li
                  key={video.uri}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover/40 transition-colors"
                >
                  <span className="w-5 text-text-muted text-sm font-medium shrink-0">
                    {idx + 1}
                  </span>
                  <div className="w-16 h-10 rounded bg-surface-hover overflow-hidden shrink-0">
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
                    <p className="text-xs text-text-muted">{formatDate(video.createdAt)}</p>
                  </div>
                  <div className="flex gap-4 text-right shrink-0">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {formatCompact(video.viewCount)}
                      </div>
                      <div className="text-[10px] text-text-muted">views</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-text-primary">
                        {formatCompact(video.likeCount)}
                      </div>
                      <div className="text-[10px] text-text-muted">likes</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-accent">
                        {video.engagementRate.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-text-muted">eng.</div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Quick Stats sidebar */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Avg views/video</span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatCompact(avgViews)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Total likes</span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatCompact(overview.totalLikes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Total comments</span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatCompact(overview.totalComments)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Total shares</span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatCompact(overview.totalShares)}
                </span>
              </div>
            </div>
          </div>

          {bestVideo && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Best Video</h3>
              <div className="flex gap-3 items-start">
                <div className="w-16 h-10 rounded bg-surface-hover overflow-hidden shrink-0">
                  {bestVideo.thumbnailUrl ? (
                    <img
                      src={bestVideo.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoIcon className="w-4 h-4 text-text-muted" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {bestVideo.caption || 'Untitled'}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {formatCompact(bestVideo.viewCount)} views
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Hashtag performance */}
          {(trendsData?.topHashtags?.length ?? 0) > 0 && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Top Hashtags</h3>
              <div className="space-y-2">
                {trendsData!.topHashtags.slice(0, 5).map((ht) => (
                  <div key={ht.tag} className="flex items-center justify-between">
                    <span className="text-sm text-accent">#{ht.tag}</span>
                    <span className="text-xs text-text-muted">
                      {formatCompact(ht.totalViews)} views
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Earnings */}
      {earningsData && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-text-primary">Earnings</h3>
              <p className="text-xs text-text-muted mt-0.5">Tips received from your audience</p>
            </div>
            <DollarIcon className="w-5 h-5 text-accent" />
          </div>
          <div className="p-6 space-y-6">
            {/* Balance summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface-hover rounded-xl p-4 text-center">
                <p className="text-xs text-text-muted mb-1">Total Earned</p>
                <p className="text-xl font-bold text-text-primary">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                    earningsData.totalEarnings / 100
                  )}
                </p>
              </div>
              <div className="bg-surface-hover rounded-xl p-4 text-center">
                <p className="text-xs text-text-muted mb-1">Available</p>
                <p className="text-xl font-bold text-green-500">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                    earningsData.availableBalance / 100
                  )}
                </p>
              </div>
              <div className="bg-surface-hover rounded-xl p-4 text-center">
                <p className="text-xs text-text-muted mb-1">Pending</p>
                <p className="text-xl font-bold text-text-secondary">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                    earningsData.pendingBalance / 100
                  )}
                </p>
              </div>
            </div>

            {/* Recent tips */}
            {earningsData.recentTips.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-text-primary mb-3">Recent Tips</h4>
                <div className="space-y-2">
                  {earningsData.recentTips.slice(0, 5).map((tip, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-semibold text-sm shrink-0">
                          {tip.senderHandle[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            @{tip.senderHandle}
                          </p>
                          {tip.message && (
                            <p className="text-xs text-text-muted truncate max-w-[240px]">
                              {tip.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-green-500">
                          +{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tip.amount / 100)}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {formatDate(tip.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">No tips received yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Videos Tab ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

function VideosTab({ period }: { period: Period }) {
  const [sortCol, setSortCol] = useState<SortCol>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'video-perf', period, sortCol],
    queryFn: () =>
      api.getCreatorVideoPerformance({
        period,
        sortBy:
          sortCol === 'viewCount'
            ? 'views'
            : sortCol === 'likeCount'
            ? 'likes'
            : sortCol === 'commentCount'
            ? 'comments'
            : sortCol === 'engagementRate'
            ? 'engagement'
            : 'views',
        limit: 100,
      }),
    retry: 1,
  });

  const videos = data?.videos ?? [];

  const sorted = useMemo(() => {
    return [...videos].sort((a, b) => {
      const av = a[sortCol] as number | string;
      const bv = b[sortCol] as number | string;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc'
          ? av.localeCompare(bv)
          : bv.localeCompare(av);
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [videos, sortCol, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(0);
  }

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (col !== sortCol)
      return <span className="text-text-muted opacity-40 ml-1">↕</span>;
    return (
      <span className="text-accent ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return <EmptyAnalytics />;
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-hover/50">
                <th className="text-left px-4 py-3 text-text-muted font-medium">Video</th>
                {(
                  [
                    ['viewCount', 'Views'],
                    ['likeCount', 'Likes'],
                    ['commentCount', 'Comments'],
                    ['shareCount', 'Shares'],
                    ['engagementRate', 'Eng. Rate'],
                    ['createdAt', 'Posted'],
                  ] as [SortCol, string][]
                ).map(([col, label]) => (
                  <th
                    key={col}
                    className="text-right px-4 py-3 text-text-muted font-medium cursor-pointer hover:text-text-primary whitespace-nowrap select-none"
                    onClick={() => handleSort(col)}
                  >
                    {label}
                    <SortIcon col={col} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.map((video) => (
                <tr
                  key={video.uri}
                  className="hover:bg-surface-hover/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-10 rounded bg-surface-hover overflow-hidden shrink-0">
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
                      <span className="text-text-primary max-w-[200px] truncate">
                        {video.caption || 'Untitled'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary font-medium">
                    {formatCompact(video.viewCount)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary">
                    {formatCompact(video.likeCount)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary">
                    {formatCompact(video.commentCount)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary">
                    {formatCompact(video.shareCount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        video.engagementRate >= 5
                          ? 'text-green-500 font-semibold'
                          : video.engagementRate >= 2
                          ? 'text-accent'
                          : 'text-text-muted'
                      }
                    >
                      {video.engagementRate.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-text-muted whitespace-nowrap">
                    {formatDate(video.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of{' '}
              {sorted.length} videos
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-muted disabled:opacity-40 hover:text-text-primary transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-muted disabled:opacity-40 hover:text-text-primary transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Audience Tab ─────────────────────────────────────────────────────────────

function AudienceTab({ period }: { period: Period }) {
  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview', period],
    queryFn: () => api.getCreatorAnalyticsOverview(period),
    retry: 1,
  });

  const { data: audienceData, isLoading: audienceLoading } = useQuery({
    queryKey: ['analytics', 'audience'],
    queryFn: () => api.getCreatorAudienceDemographics(),
    retry: 1,
  });

  if (overviewLoading || audienceLoading) return <OverviewSkeleton />;

  const growth = audienceData?.followerGrowth ?? [];
  const topViewers = audienceData?.topViewers ?? [];
  const overview = overviewData?.overview;

  const growthChartLabels = growth.slice(-30).map((g) => {
    const d = new Date(g.date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const growthChartData = growth.slice(-30).map((g) => g.count);

  return (
    <div className="space-y-6">
      {/* Follower totals */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="Total Followers"
          value={formatCompact(overview?.totalFollowers ?? 0)}
          icon={<UsersIcon className="w-4 h-4" />}
        />
        <StatCard
          label={`New Followers (${period})`}
          value={`+${formatCompact(overview?.newFollowers ?? 0)}`}
          icon={<TrendUpIcon className="w-4 h-4" />}
          trend={
            (overview?.newFollowers ?? 0) > 0
              ? { value: 'this period', positive: true }
              : null
          }
        />
      </div>

      {/* Follower Growth Chart */}
      {growth.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-base font-semibold text-text-primary mb-1">Follower Growth</h3>
          <p className="text-xs text-text-muted mb-4">Daily new followers</p>
          <LineChart
            labels={growthChartLabels}
            datasets={[
              {
                label: 'New Followers',
                data: growthChartData,
                fill: true,
              },
            ]}
            height={200}
            showLegend={false}
          />
        </div>
      )}

      {/* Top Viewers */}
      {topViewers.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-text-primary">Most Engaged Viewers</h3>
          </div>
          <div className="divide-y divide-border">
            {topViewers.slice(0, 10).map((viewer) => (
              <div
                key={viewer.did}
                className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-surface-hover overflow-hidden shrink-0">
                  {viewer.avatar ? (
                    <img
                      src={viewer.avatar}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted text-sm font-medium">
                      {viewer.handle[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {viewer.displayName || viewer.handle}
                  </p>
                  <p className="text-xs text-text-muted">@{viewer.handle}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {formatCompact(viewer.viewCount)}
                  </p>
                  <p className="text-xs text-text-muted">views</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {topViewers.length === 0 && growth.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <UsersIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No audience data available yet</p>
        </div>
      )}
    </div>
  );
}

// ─── Engagement Tab ───────────────────────────────────────────────────────────

function EngagementTab({ period }: { period: Period }) {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'engagement', period],
    queryFn: () => api.getCreatorEngagementBreakdown(period),
    retry: 1,
  });

  const { data: trendsData } = useQuery({
    queryKey: ['analytics', 'trends', period],
    queryFn: () => api.getCreatorContentTrends(period),
    retry: 1,
  });

  if (isLoading) return <OverviewSkeleton />;

  const dailyLikes = data?.likes?.daily ?? [];
  const dailyComments = data?.comments?.daily ?? [];

  // Merge likes + comments into a combined timeline
  const allDates = Array.from(
    new Set([...dailyLikes.map((d) => d.date), ...dailyComments.map((d) => d.date)])
  ).sort();

  const likesByDate = Object.fromEntries(dailyLikes.map((d) => [d.date, d.count]));
  const commentsByDate = Object.fromEntries(dailyComments.map((d) => [d.date, d.count]));

  const labels = allDates.slice(-30).map((d) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  });
  const likesData = allDates.slice(-30).map((d) => likesByDate[d] ?? 0);
  const commentsData = allDates.slice(-30).map((d) => commentsByDate[d] ?? 0);

  const totalLikes = data?.likes?.total ?? 0;
  const totalComments = data?.comments?.total ?? 0;

  const dailyViews = trendsData?.dailyStats ?? [];
  const totalPeriodViews = dailyViews.reduce((sum, d) => sum + d.views, 0);
  const engRate =
    totalPeriodViews > 0
      ? (((totalLikes + totalComments) / totalPeriodViews) * 100).toFixed(2)
      : '0.00';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Likes This Period"
          value={formatCompact(totalLikes)}
          icon={<HeartIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Comments This Period"
          value={formatCompact(totalComments)}
          icon={<ChatIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Engagement Rate"
          value={`${engRate}%`}
          sub="vs total views"
          icon={<TrendUpIcon className="w-4 h-4" />}
        />
      </div>

      {labels.length > 0 ? (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-base font-semibold text-text-primary mb-1">
            Likes vs Comments Over Time
          </h3>
          <p className="text-xs text-text-muted mb-4">Daily engagement activity</p>
          <LineChart
            labels={labels}
            datasets={[
              { label: 'Likes', data: likesData, fill: false },
              { label: 'Comments', data: commentsData, fill: false },
            ]}
            height={220}
            showLegend
          />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <HeartIcon className="w-10 h-10 mx-auto mb-3 text-text-muted opacity-40" />
          <p className="text-text-muted">No engagement data for this period yet</p>
        </div>
      )}

      {/* Audience Activity Heatmap (hour-of-day using audience data) */}
      {dailyViews.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-base font-semibold text-text-primary mb-1">Content Activity</h3>
          <p className="text-xs text-text-muted mb-4">Views and likes per day of the week</p>
          <ChartBarChart
            labels={dailyViews.slice(-7).map((d) =>
              new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })
            )}
            datasets={[
              {
                label: 'Views',
                data: dailyViews.slice(-7).map((d) => d.views),
              },
              {
                label: 'Likes',
                data: dailyViews.slice(-7).map((d) => d.likes),
              },
            ]}
            height={200}
            showLegend
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('30d');

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <ChartBarIcon className="w-12 h-12 mx-auto mb-4 text-text-muted" />
          <h1 className="text-xl font-bold text-text-primary mb-2">Sign in to view analytics</h1>
          <p className="text-text-muted text-sm mb-4">
            Track your content performance and audience growth.
          </p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg font-medium transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'videos', label: 'Videos' },
    { id: 'audience', label: 'Audience' },
    { id: 'engagement', label: 'Engagement' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Creator Analytics</h1>
            <p className="text-text-muted text-sm mt-1">
              Track your content performance and audience growth
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === p.value
                    ? 'bg-accent text-text-inverse'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-0 border-b border-border mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && <OverviewTab period={period} />}
        {activeTab === 'videos' && <VideosTab period={period} />}
        {activeTab === 'audience' && <AudienceTab period={period} />}
        {activeTab === 'engagement' && <EngagementTab period={period} />}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function TrendDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.306-4.307a11.95 11.95 0 015.814 5.519l2.74 1.22m0 0l-5.94 2.28m5.94-2.28l-2.28-5.941" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 11.219 12.768 11 12 11c-.768 0-1.536-.219-2.121-.659-1.172-.879-1.172-2.303 0-3.182C10.465 6.759 11.232 6.5 12 6.5c.768 0 1.536.219 2.121.659M12 6V4.5m0 15V18" />
    </svg>
  );
}
