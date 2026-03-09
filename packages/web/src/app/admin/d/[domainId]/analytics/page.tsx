// @ts-nocheck
'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { formatCount } from '@/lib/utils';
import {
  PageHeader,
  StatsGrid,
  StatCard,
  StatsGridSkeleton,
} from '@/components/admin/ui';

export default function DomainAnalyticsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'analytics'],
    queryFn: () => api.adminDomainAnalyticsGet(domainId),
    enabled: !!domainId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description={`Analytics for ${selectedDomain?.name || 'domain'}`}
        />
        <StatsGridSkeleton count={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load analytics</p>
      </div>
    );
  }

  const stats = data?.stats || {
    totalUsers: 0,
    activeUsers: 0,
    totalContent: 0,
    totalViews: 0,
    totalLikes: 0,
    newUsersToday: 0,
    newUsersWeek: 0,
    engagementRate: 0,
  };

  const trends = data?.trends || {
    users: [],
    content: [],
    engagement: [],
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description={`Analytics and metrics for ${selectedDomain?.name || 'this domain'}`}
      />

      {/* Overview Stats */}
      <StatsGrid columns={4}>
        <StatCard
          title="Total Users"
          value={formatCount(stats.totalUsers)}
          trend={
            stats.newUsersWeek > 0
              ? { value: stats.newUsersWeek, direction: 'up', label: 'this week' }
              : undefined
          }
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard
          title="Active Users"
          value={formatCount(stats.activeUsers)}
          subtitle={`${stats.totalUsers > 0 ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1) : 0}% of total`}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Content"
          value={formatCount(stats.totalContent)}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          title="Total Views"
          value={formatCount(stats.totalViews)}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          }
        />
      </StatsGrid>

      {/* Engagement Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-text-muted mb-4">Growth</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">New Users Today</span>
              <span className="text-text-primary font-semibold text-green-500">
                +{stats.newUsersToday}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">New Users This Week</span>
              <span className="text-text-primary font-semibold text-green-500">
                +{stats.newUsersWeek}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-text-muted mb-4">Engagement</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Total Likes</span>
              <span className="text-text-primary font-semibold">{formatCount(stats.totalLikes)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Engagement Rate</span>
              <span className="text-text-primary font-semibold">{stats.engagementRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-medium text-text-muted mb-4">Averages</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Views per Content</span>
              <span className="text-text-primary font-semibold">
                {stats.totalContent > 0
                  ? formatCount(Math.round(stats.totalViews / stats.totalContent))
                  : '0'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Likes per Content</span>
              <span className="text-text-primary font-semibold">
                {stats.totalContent > 0
                  ? formatCount(Math.round(stats.totalLikes / stats.totalContent))
                  : '0'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Trends Charts Placeholder */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Activity Trends</h3>
        <div className="h-64 flex items-center justify-center text-text-muted">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">Chart visualization coming soon</p>
            <p className="text-xs text-text-muted mt-1">Historical data is being collected</p>
          </div>
        </div>
      </div>

      {/* Top Content & Users */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Top Content</h3>
          {data?.topContent && data.topContent.length > 0 ? (
            <div className="space-y-3">
              {data.topContent.map((item: any, index: number) => (
                <div key={item.uri} className="flex items-center gap-3">
                  <span className="text-text-muted font-medium w-6">{index + 1}</span>
                  <div className="w-12 h-8 rounded bg-surface-hover overflow-hidden flex-shrink-0">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{item.title || 'Untitled'}</p>
                    <p className="text-xs text-text-muted">{formatCount(item.views)} views</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No content data available</p>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Top Creators</h3>
          {data?.topCreators && data.topCreators.length > 0 ? (
            <div className="space-y-3">
              {data.topCreators.map((creator: any, index: number) => (
                <div key={creator.did} className="flex items-center gap-3">
                  <span className="text-text-muted font-medium w-6">{index + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                    {creator.avatar ? (
                      <img src={creator.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted font-medium">
                        {creator.handle?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{creator.displayName || creator.handle}</p>
                    <p className="text-xs text-text-muted">{formatCount(creator.followers)} followers</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No creator data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
