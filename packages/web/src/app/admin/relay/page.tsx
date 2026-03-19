'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  api,
  RelayStatsResponse,
  RelayConfig,
  RelaySubscribersResponse,
  RelayProtocolHealth,
} from '@/lib/api';

type ProtocolTab = 'all' | 'socketio' | 'websocket' | 'jetstream';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'healthy'
      ? 'bg-green-500'
      : status === 'idle'
        ? 'bg-yellow-500'
        : status === 'disabled'
          ? 'bg-gray-400'
          : 'bg-red-500';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />;
}

export default function RelayAdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProtocolTab>('all');
  const [showConfig, setShowConfig] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<RelayStatsResponse>({
    queryKey: ['admin', 'relay', 'stats'],
    queryFn: () => api.adminRelayGetStats(),
    refetchInterval: 5000,
  });

  const { data: config } = useQuery<RelayConfig>({
    queryKey: ['admin', 'relay', 'config'],
    queryFn: () => api.adminRelayGetConfig(),
  });

  const { data: health } = useQuery<RelayProtocolHealth>({
    queryKey: ['admin', 'relay', 'health'],
    queryFn: () => api.adminRelayGetProtocolHealth(),
    refetchInterval: 5000,
  });

  const { data: subscribers } = useQuery<RelaySubscribersResponse>({
    queryKey: ['admin', 'relay', 'subscribers', activeTab],
    queryFn: () =>
      api.adminRelayGetSubscribers(activeTab === 'all' ? undefined : activeTab),
    refetchInterval: 5000,
  });

  const disconnectMutation = useMutation({
    mutationFn: (subscriberId: string) =>
      api.adminRelayDisconnectSubscriber(subscriberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'relay'] });
    },
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const protocols = health
    ? [
        { key: 'socketio' as const, label: 'Socket.IO', ...health.socketio },
        { key: 'websocket' as const, label: 'Raw WebSocket (CBOR)', ...health.websocket },
        { key: 'jetstream' as const, label: 'Jetstream (JSON)', ...health.jetstream },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Relay & Firehose</h1>
          <p className="text-text-muted mt-1">
            Monitor and manage AT Protocol firehose endpoints
          </p>
        </div>
        <button
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['admin', 'relay'] })
          }
          className="px-4 py-2 bg-surface-elevated text-text-primary rounded-lg hover:bg-surface-elevated/80 transition-colors text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Protocol Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {protocols.map((proto) => (
          <div
            key={proto.key}
            className="bg-surface rounded-xl border border-border p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text-primary">{proto.label}</h3>
              <div className="flex items-center gap-2">
                <StatusDot status={proto.status} />
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    proto.enabled
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-gray-500/10 text-gray-400'
                  }`}
                >
                  {proto.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-muted">Clients</p>
                <p className="text-lg font-medium text-text-primary">
                  {proto.clients}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Events/sec</p>
                <p className="text-lg font-medium text-text-primary">
                  {proto.eventsPerSec.toFixed(1)}
                </p>
              </div>
              {stats?.protocols && (
                <>
                  <div>
                    <p className="text-text-muted">Total Events</p>
                    <p className="text-text-primary font-medium">
                      {(
                        stats.protocols[proto.key]?.totalEvents ?? 0
                      ).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-muted">Bandwidth</p>
                    <p className="text-text-primary font-medium">
                      {formatBytes(
                        stats.protocols[proto.key]?.bytesPerSec ?? 0
                      )}
                      /s
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Sequence Info */}
      {stats?.sequence && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="font-semibold text-text-primary mb-3">
            Sequence Info
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-text-muted">Current Seq</p>
              <p className="text-lg font-medium text-text-primary">
                {stats.sequence.currentSeq.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Oldest Seq</p>
              <p className="text-lg font-medium text-text-primary">
                {stats.sequence.oldestSeq?.toLocaleString() ?? 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Event Count</p>
              <p className="text-lg font-medium text-text-primary">
                {stats.sequence.eventCount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-text-muted">Total Clients</p>
              <p className="text-lg font-medium text-text-primary">
                {stats.totalClients}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Subscriber Table */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-text-primary">Subscribers</h3>
            <div className="flex gap-1 bg-surface-elevated rounded-lg p-0.5">
              {(['all', 'socketio', 'websocket', 'jetstream'] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      activeTab === tab
                        ? 'bg-accent text-white'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {tab === 'all'
                      ? 'All'
                      : tab === 'socketio'
                        ? 'Socket.IO'
                        : tab === 'websocket'
                          ? 'WebSocket'
                          : 'Jetstream'}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="text-left p-3 font-medium">ID</th>
                <th className="text-left p-3 font-medium">Protocol</th>
                <th className="text-left p-3 font-medium">Collections</th>
                <th className="text-left p-3 font-medium">Connected</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* WebSocket clients */}
              {(subscribers?.wsClients ?? []).map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-border/50 hover:bg-surface-elevated/50"
                >
                  <td className="p-3 font-mono text-xs text-text-primary">
                    {client.id}
                  </td>
                  <td className="p-3 text-text-muted">WebSocket</td>
                  <td className="p-3 text-text-muted text-xs">
                    {client.wantedCollections?.join(', ') || 'All'}
                  </td>
                  <td className="p-3 text-text-muted text-xs">
                    {new Date(client.connectedAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
                      active
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => disconnectMutation.mutate(client.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
              {/* Jetstream clients */}
              {(subscribers?.jetstreamClients ?? []).map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-border/50 hover:bg-surface-elevated/50"
                >
                  <td className="p-3 font-mono text-xs text-text-primary">
                    {client.id}
                  </td>
                  <td className="p-3 text-text-muted">Jetstream</td>
                  <td className="p-3 text-text-muted text-xs">
                    {client.wantedCollections?.join(', ') || 'All'}
                  </td>
                  <td className="p-3 text-text-muted text-xs">
                    {new Date(client.connectedAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
                      active
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => disconnectMutation.mutate(client.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
              {/* Cursor store subscribers (Socket.IO) */}
              {(subscribers?.subscribers ?? []).map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b border-border/50 hover:bg-surface-elevated/50"
                >
                  <td className="p-3 font-mono text-xs text-text-primary">
                    {sub.id}
                  </td>
                  <td className="p-3 text-text-muted">{sub.endpoint || 'Socket.IO'}</td>
                  <td className="p-3 text-text-muted text-xs">
                    {sub.wantedCollections?.join(', ') || 'All'}
                  </td>
                  <td className="p-3 text-text-muted text-xs">
                    {new Date(sub.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        sub.status === 'active'
                          ? 'bg-green-500/10 text-green-500'
                          : sub.status === 'inactive'
                            ? 'bg-yellow-500/10 text-yellow-500'
                            : 'bg-gray-500/10 text-gray-400'
                      }`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => disconnectMutation.mutate(sub.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
              {!subscribers?.subscribers?.length &&
                !subscribers?.wsClients?.length &&
                !subscribers?.jetstreamClients?.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-6 text-center text-text-muted"
                    >
                      No subscribers connected
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="bg-surface rounded-xl border border-border">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full p-5 flex items-center justify-between text-left"
        >
          <h3 className="font-semibold text-text-primary">Configuration</h3>
          <svg
            className={`w-5 h-5 text-text-muted transition-transform ${
              showConfig ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {showConfig && config && (
          <div className="px-5 pb-5 border-t border-border pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-muted mb-1">Socket.IO</p>
                <p className="text-text-primary">
                  {config.socketio.enabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div>
                <p className="text-text-muted mb-1">Raw WebSocket</p>
                <p className="text-text-primary">
                  {config.websocket.enabled ? 'Enabled' : 'Disabled'} (max{' '}
                  {config.websocket.maxSubscribers} subscribers)
                </p>
              </div>
              <div>
                <p className="text-text-muted mb-1">Jetstream</p>
                <p className="text-text-primary">
                  {config.jetstream.enabled ? 'Enabled' : 'Disabled'} (max{' '}
                  {config.jetstream.maxSubscribers} subscribers)
                </p>
              </div>
              <div>
                <p className="text-text-muted mb-1">Signature Verification</p>
                <p className="text-text-primary">
                  {config.verifySignatures ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div>
                <p className="text-text-muted mb-1">Max Backfill Events</p>
                <p className="text-text-primary">
                  {config.maxBackfillEvents.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-text-muted mb-1">Backfill Capacity</p>
                <p className="text-text-primary">
                  {config.sequence.eventCount.toLocaleString()} events stored
                </p>
              </div>
            </div>
            <p className="text-xs text-text-muted mt-4">
              Configuration is managed via environment variables. Restart the
              service to apply changes.
            </p>
          </div>
        )}
      </div>

      {/* Link to Federation */}
      <div className="text-sm text-text-muted">
        See also:{' '}
        <Link
          href="/admin/federation"
          className="text-accent hover:underline"
        >
          Federation settings
        </Link>{' '}
        for inbound relay subscriptions.
      </div>
    </div>
  );
}
