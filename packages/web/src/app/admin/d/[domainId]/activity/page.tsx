// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  SimpleTabs,
  SearchInput,
  FilterDropdown,
  Badge,
  PageSkeleton,
  NoDataState,
} from '@/components/admin/ui';

export default function DomainActivityPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'activity', activeTab, search, typeFilter],
    queryFn: () =>
      api.adminDomainActivityFeed(domainId, {
        type: activeTab !== 'all' ? activeTab : undefined,
        search: search || undefined,
        types: typeFilter.length > 0 ? typeFilter : undefined,
        limit: 50,
      }),
    enabled: !!domainId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load activity feed</p>
      </div>
    );
  }

  const activities = data?.activities || [];
  const stats = data?.stats || {
    totalToday: 0,
    totalWeek: 0,
    byType: {},
  };

  const tabs = [
    { id: 'all', label: 'All Activity' },
    { id: 'users', label: 'Users' },
    { id: 'content', label: 'Content' },
    { id: 'moderation', label: 'Moderation' },
    { id: 'system', label: 'System' },
  ];

  const typeOptions = [
    { value: 'user.signup', label: 'User Signups' },
    { value: 'user.login', label: 'User Logins' },
    { value: 'content.created', label: 'Content Created' },
    { value: 'content.liked', label: 'Content Liked' },
    { value: 'content.reported', label: 'Content Reported' },
    { value: 'moderation.action', label: 'Moderation Actions' },
  ];

  const getActivityIcon = (type: string) => {
    if (type.startsWith('user.signup')) {
      return (
        <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
      );
    }
    if (type.startsWith('user.login')) {
      return (
        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
        </div>
      );
    }
    if (type.startsWith('content.created')) {
      return (
        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
      );
    }
    if (type.startsWith('content.liked')) {
      return (
        <div className="w-8 h-8 rounded-full bg-pink-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
      );
    }
    if (type.startsWith('content.reported') || type.startsWith('moderation')) {
      return (
        <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
        <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  };

  const formatTimeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Feed"
        description={`Real-time activity for ${selectedDomain?.name || 'this domain'}`}
        badge={
          <Badge variant="info">
            {stats.totalToday} today
          </Badge>
        }
      />

      {/* Quick Stats */}
      <div className="flex gap-4">
        <div className="bg-surface border border-border rounded-lg px-4 py-2">
          <span className="text-text-muted text-sm">Today: </span>
          <span className="text-text-primary font-semibold">{stats.totalToday}</span>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-2">
          <span className="text-text-muted text-sm">This Week: </span>
          <span className="text-text-primary font-semibold">{stats.totalWeek}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SimpleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <div className="flex-1" />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search activities..."
          className="w-64"
        />
        <FilterDropdown
          label="Type"
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
        />
      </div>

      {/* Activity Timeline */}
      <div className="bg-surface border border-border rounded-xl">
        {activities.length === 0 ? (
          <div className="p-8">
            <NoDataState itemType="activities" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {activities.map((activity: any) => (
              <div key={activity.id} className="flex items-start gap-4 p-4 hover:bg-surface-hover transition-colors">
                {getActivityIcon(activity.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">
                    {activity.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">{formatTimeAgo(activity.createdAt)}</span>
                    {activity.user && (
                      <>
                        <span className="text-xs text-text-muted">•</span>
                        <span className="text-xs text-text-muted">@{activity.user.handle}</span>
                      </>
                    )}
                  </div>
                </div>
                <Badge variant="default" size="sm">
                  {activity.type.split('.')[0]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
