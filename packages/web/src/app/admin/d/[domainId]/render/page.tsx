// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { formatCount } from '@/lib/utils';
import {
  PageHeader,
  StatsGrid,
  StatCard,
  SimpleTabs,
  DataTable,
  Column,
  Badge,
  StatusBadge,
  HealthIndicator,
  PageSkeleton,
} from '@/components/admin/ui';

export default function DomainRenderPipelinePage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('queue');

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'render'],
    queryFn: () => api.adminDomainRenderQueueStats(domainId),
    enabled: !!domainId,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load render pipeline data</p>
      </div>
    );
  }

  const stats = data?.stats || {
    queuedJobs: 0,
    processingJobs: 0,
    completedToday: 0,
    failedToday: 0,
    avgProcessingTime: 0,
    workers: 0,
    workerCapacity: 0,
  };

  const queue = data?.queue || [];
  const workers = data?.workers || [];

  const tabs = [
    { id: 'queue', label: 'Job Queue', badge: stats.queuedJobs + stats.processingJobs },
    { id: 'workers', label: 'Workers', badge: stats.workers },
  ];

  const queueColumns: Column<any>[] = [
    {
      key: 'id',
      header: 'Job ID',
      render: (row) => (
        <span className="text-sm font-mono text-text-muted">{row.id.slice(-8)}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge variant={row.type === 'video' ? 'info' : 'default'}>{row.type}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${row.progress || 0}%` }}
            />
          </div>
          <span className="text-xs text-text-muted">{row.progress || 0}%</span>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'worker',
      header: 'Worker',
      render: (row) => (
        <span className="text-sm text-text-muted">{row.workerId || '-'}</span>
      ),
    },
  ];

  const workerColumns: Column<any>[] = [
    {
      key: 'id',
      header: 'Worker ID',
      render: (row) => (
        <span className="text-sm font-mono text-text-primary">{row.id}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <HealthIndicator
          health={row.status === 'active' ? 'healthy' : row.status === 'idle' ? 'degraded' : 'down'}
        />
      ),
    },
    {
      key: 'currentJob',
      header: 'Current Job',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {row.currentJob ? row.currentJob.slice(-8) : 'None'}
        </span>
      ),
    },
    {
      key: 'completedJobs',
      header: 'Completed',
      render: (row) => (
        <span className="text-sm text-text-primary">{row.completedJobs}</span>
      ),
    },
    {
      key: 'failedJobs',
      header: 'Failed',
      render: (row) => (
        <span className={`text-sm ${row.failedJobs > 0 ? 'text-red-500' : 'text-text-muted'}`}>
          {row.failedJobs}
        </span>
      ),
    },
    {
      key: 'lastActive',
      header: 'Last Active',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {row.lastActive ? new Date(row.lastActive).toLocaleTimeString() : '-'}
        </span>
      ),
    },
  ];

  const workerUtilization = stats.workerCapacity > 0
    ? Math.round((stats.workers / stats.workerCapacity) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Render Pipeline"
        description={`Video processing and rendering for ${selectedDomain?.name || 'this domain'}`}
      />

      <StatsGrid columns={4}>
        <StatCard
          title="Queued Jobs"
          value={stats.queuedJobs}
          variant={stats.queuedJobs > 50 ? 'warning' : 'default'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          }
        />
        <StatCard
          title="Processing"
          value={stats.processingJobs}
          variant="info"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
        />
        <StatCard
          title="Completed Today"
          value={stats.completedToday}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          title="Failed Today"
          value={stats.failedToday}
          variant={stats.failedToday > 0 ? 'error' : 'default'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          }
        />
      </StatsGrid>

      {/* Worker Status */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Worker Capacity</h3>
          <HealthIndicator
            health={workerUtilization > 90 ? 'degraded' : workerUtilization > 0 ? 'healthy' : 'down'}
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="h-3 bg-surface-hover rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  workerUtilization > 90 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${workerUtilization}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-text-muted">
            {stats.workers} / {stats.workerCapacity} workers active
          </span>
        </div>
        <p className="text-sm text-text-muted mt-3">
          Average processing time: {stats.avgProcessingTime}s per job
        </p>
      </div>

      <SimpleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'queue' && (
        <DataTable
          data={queue}
          columns={queueColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="jobs in queue"
        />
      )}

      {activeTab === 'workers' && (
        <DataTable
          data={workers}
          columns={workerColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="workers"
        />
      )}
    </div>
  );
}
