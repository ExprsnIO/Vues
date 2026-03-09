// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  StatsGrid,
  StatCard,
  SimpleTabs,
  DataTable,
  Column,
  Toggle,
  FormField,
  Input,
  RowActionMenu,
  ConfirmDialog,
  Badge,
  PageSkeleton,
} from '@/components/admin/ui';

export default function DomainLiveStreamsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('active');
  const [endStreamId, setEndStreamId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'live'],
    queryFn: () => api.adminDomainLiveStreamsList(domainId),
    enabled: !!domainId,
    refetchInterval: 30000, // Refresh every 30 seconds for live data
  });

  const endStreamMutation = useMutation({
    mutationFn: (streamId: string) => api.adminDomainLiveStreamEnd(domainId, streamId),
    onSuccess: () => {
      toast.success('Stream ended');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'live'] });
      setEndStreamId(null);
    },
    onError: () => {
      toast.error('Failed to end stream');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load live streams</p>
      </div>
    );
  }

  const activeStreams = data?.active || [];
  const pastStreams = data?.past || [];
  const config = data?.config || { enabled: false };
  const stats = data?.stats || {
    activeCount: 0,
    totalViewers: 0,
    peakViewers: 0,
    totalStreamsToday: 0,
  };

  const tabs = [
    { id: 'active', label: 'Active Streams', badge: activeStreams.length },
    { id: 'past', label: 'Past Streams' },
    { id: 'settings', label: 'Settings' },
  ];

  const streamColumns: Column<any>[] = [
    {
      key: 'streamer',
      header: 'Streamer',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden">
            {row.streamer?.avatar ? (
              <img src={row.streamer.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                {row.streamer?.handle?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {row.streamer?.displayName || row.streamer?.handle}
            </p>
            <p className="text-xs text-text-muted">@{row.streamer?.handle}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (row) => (
        <span className="text-sm text-text-primary">{row.title || 'Untitled Stream'}</span>
      ),
    },
    {
      key: 'viewers',
      header: 'Viewers',
      render: (row) => (
        <span className="text-sm font-medium text-text-primary">{row.viewerCount || 0}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'live' ? 'error' : 'default'} dot>
          {row.status === 'live' ? 'Live' : row.status}
        </Badge>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (row) => {
        const start = new Date(row.startedAt);
        const end = row.endedAt ? new Date(row.endedAt) : new Date();
        const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60);
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        return (
          <span className="text-sm text-text-muted">
            {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row) => (
        <RowActionMenu
          items={[
            { label: 'View Stream', onClick: () => window.open(row.url, '_blank') },
            ...(row.status === 'live'
              ? [{ label: 'End Stream', onClick: () => setEndStreamId(row.id), variant: 'danger' as const }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Streams"
        description={`Live streaming management for ${selectedDomain?.name || 'this domain'}`}
        badge={
          activeStreams.length > 0 && (
            <Badge variant="error" dot>
              {activeStreams.length} Live
            </Badge>
          )
        }
      />

      <StatsGrid columns={4}>
        <StatCard
          title="Active Streams"
          value={stats.activeCount}
          variant={stats.activeCount > 0 ? 'error' : 'default'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          title="Total Viewers"
          value={stats.totalViewers}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          }
        />
        <StatCard
          title="Peak Viewers"
          value={stats.peakViewers}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <StatCard
          title="Streams Today"
          value={stats.totalStreamsToday}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
      </StatsGrid>

      <SimpleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'active' && (
        <DataTable
          data={activeStreams}
          columns={streamColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="active streams"
        />
      )}

      {activeTab === 'past' && (
        <DataTable
          data={pastStreams}
          columns={streamColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="past streams"
        />
      )}

      {activeTab === 'settings' && (
        <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
          <Toggle
            checked={config.enabled}
            onChange={() => {}}
            label="Enable Live Streaming"
            description="Allow users to broadcast live streams on this domain"
          />

          <FormField label="Max Concurrent Streams" hint="Maximum number of simultaneous live streams">
            <Input type="number" defaultValue={config.maxConcurrent || 100} />
          </FormField>

          <FormField label="Max Stream Duration (minutes)" hint="Maximum duration for a single stream">
            <Input type="number" defaultValue={config.maxDuration || 240} />
          </FormField>

          <Toggle
            checked={config.recordingEnabled || false}
            onChange={() => {}}
            label="Enable Recording"
            description="Automatically record streams for later viewing"
          />

          <Toggle
            checked={config.chatEnabled || true}
            onChange={() => {}}
            label="Enable Chat"
            description="Allow live chat during streams"
          />
        </div>
      )}

      <ConfirmDialog
        isOpen={!!endStreamId}
        onClose={() => setEndStreamId(null)}
        onConfirm={() => endStreamId && endStreamMutation.mutate(endStreamId)}
        title="End Stream?"
        message="This will immediately end the live stream for all viewers. This action cannot be undone."
        confirmLabel="End Stream"
        variant="danger"
        isLoading={endStreamMutation.isPending}
      />
    </div>
  );
}
