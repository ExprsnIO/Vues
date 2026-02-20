'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCount } from '@/lib/utils';

type StreamStatus = 'all' | 'live' | 'scheduled' | 'ended';

interface LiveStream {
  id: string;
  title: string;
  streamerDid: string;
  streamerHandle: string;
  streamerAvatar?: string;
  status: 'live' | 'scheduled' | 'ended';
  viewerCount: number;
  peakViewers: number;
  startedAt?: string;
  scheduledFor?: string;
  endedAt?: string;
  duration?: number;
  category?: string;
  isAgeRestricted: boolean;
  streamKey?: string;
}

export default function LiveStreamAdmin() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StreamStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStream, setSelectedStream] = useState<LiveStream | null>(null);

  // Fetch live stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'live', 'stats'],
    queryFn: async () => {
      return {
        currentlyLive: 12,
        totalViewers: 4523,
        scheduledStreams: 8,
        streamsToday: 45,
        peakConcurrentViewers: 8921,
        avgStreamDuration: 62, // minutes
      };
    },
  });

  // Fetch streams
  const { data: streams, isLoading: streamsLoading } = useQuery({
    queryKey: ['admin', 'live', 'streams', statusFilter],
    queryFn: async () => {
      const mockStreams: LiveStream[] = [
        {
          id: 'stream_001',
          title: 'Late Night Gaming Session',
          streamerDid: 'did:web:gamer1.exprsn.io',
          streamerHandle: 'progamer',
          status: 'live',
          viewerCount: 1523,
          peakViewers: 2100,
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          category: 'Gaming',
          isAgeRestricted: false,
        },
        {
          id: 'stream_002',
          title: 'Music Production Tutorial',
          streamerDid: 'did:web:producer.exprsn.io',
          streamerHandle: 'beatmaker',
          status: 'live',
          viewerCount: 892,
          peakViewers: 1100,
          startedAt: new Date(Date.now() - 7200000).toISOString(),
          category: 'Music',
          isAgeRestricted: false,
        },
        {
          id: 'stream_003',
          title: 'Upcoming Product Launch',
          streamerDid: 'did:web:brand.exprsn.io',
          streamerHandle: 'techbrand',
          status: 'scheduled',
          viewerCount: 0,
          peakViewers: 0,
          scheduledFor: new Date(Date.now() + 86400000).toISOString(),
          category: 'Technology',
          isAgeRestricted: false,
        },
        {
          id: 'stream_004',
          title: 'Cooking Show - Italian Night',
          streamerDid: 'did:web:chef.exprsn.io',
          streamerHandle: 'chefmario',
          status: 'ended',
          viewerCount: 0,
          peakViewers: 3500,
          startedAt: new Date(Date.now() - 14400000).toISOString(),
          endedAt: new Date(Date.now() - 7200000).toISOString(),
          duration: 120,
          category: 'Food',
          isAgeRestricted: false,
        },
      ];
      return mockStreams;
    },
  });

  // End stream mutation
  const endStreamMutation = useMutation({
    mutationFn: async (streamId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'live'] });
      setSelectedStream(null);
    },
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      live: 'bg-red-500 text-white animate-pulse',
      scheduled: 'bg-blue-500/10 text-blue-500',
      ended: 'bg-gray-500/10 text-gray-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.ended}`}>
        {status === 'live' ? '● LIVE' : status}
      </span>
    );
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getStreamDuration = (stream: LiveStream) => {
    if (stream.duration) return formatDuration(stream.duration);
    if (stream.startedAt) {
      const start = new Date(stream.startedAt);
      const now = new Date();
      const minutes = Math.floor((now.getTime() - start.getTime()) / 60000);
      return formatDuration(minutes);
    }
    return '-';
  };

  if (statsLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Live Stream Management</h1>
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 rounded-lg">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-red-500">
            {stats?.currentlyLive || 0} streams live now
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Currently Live"
          value={(stats?.currentlyLive || 0).toString()}
          icon={LiveIcon}
          color="red"
        />
        <StatCard
          label="Total Viewers"
          value={formatCount(stats?.totalViewers || 0)}
          icon={ViewersIcon}
        />
        <StatCard
          label="Scheduled"
          value={(stats?.scheduledStreams || 0).toString()}
          icon={ScheduleIcon}
          color="blue"
        />
        <StatCard
          label="Streams Today"
          value={(stats?.streamsToday || 0).toString()}
          icon={CalendarIcon}
        />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm text-text-muted mb-2">Peak Concurrent Viewers (24h)</h3>
          <p className="text-3xl font-bold text-text-primary">{formatCount(stats?.peakConcurrentViewers || 0)}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm text-text-muted mb-2">Average Stream Duration</h3>
          <p className="text-3xl font-bold text-text-primary">{formatDuration(stats?.avgStreamDuration || 0)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search streams..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StreamStatus)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="all">All Status</option>
          <option value="live">Live Now</option>
          <option value="scheduled">Scheduled</option>
          <option value="ended">Ended</option>
        </select>
      </div>

      {/* Streams List */}
      <div className="space-y-4">
        {streams?.map((stream) => (
          <div
            key={stream.id}
            className={`bg-surface border rounded-xl p-4 ${
              stream.status === 'live' ? 'border-red-500/50' : 'border-border'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center text-text-muted font-semibold">
                    {stream.streamerHandle[0]?.toUpperCase()}
                  </div>
                  {stream.status === 'live' && (
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-surface" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-text-primary">{stream.title}</h3>
                    {getStatusBadge(stream.status)}
                  </div>
                  <p className="text-sm text-text-muted">@{stream.streamerHandle}</p>
                  {stream.category && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                      {stream.category}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                {stream.status === 'live' && (
                  <>
                    <p className="text-2xl font-bold text-text-primary">{formatCount(stream.viewerCount)}</p>
                    <p className="text-xs text-text-muted">viewers</p>
                  </>
                )}
                {stream.status === 'scheduled' && stream.scheduledFor && (
                  <>
                    <p className="text-sm font-medium text-text-primary">
                      {new Date(stream.scheduledFor).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-text-muted">
                      {new Date(stream.scheduledFor).toLocaleTimeString()}
                    </p>
                  </>
                )}
                {stream.status === 'ended' && (
                  <>
                    <p className="text-sm font-medium text-text-primary">
                      Peak: {formatCount(stream.peakViewers)}
                    </p>
                    <p className="text-xs text-text-muted">
                      Duration: {getStreamDuration(stream)}
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-4 text-sm text-text-muted">
                {stream.status === 'live' && stream.startedAt && (
                  <span>Started {getStreamDuration(stream)} ago</span>
                )}
                {stream.isAgeRestricted && (
                  <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-xs">
                    Age Restricted
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedStream(stream)}
                  className="px-3 py-1 text-sm text-accent hover:bg-accent/10 rounded transition-colors"
                >
                  Details
                </button>
                {stream.status === 'live' && (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to end this stream?')) {
                        endStreamMutation.mutate(stream.id);
                      }
                    }}
                    className="px-3 py-1 text-sm text-red-500 hover:bg-red-500/10 rounded transition-colors"
                  >
                    End Stream
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stream Detail Modal */}
      {selectedStream && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Stream Details</h3>
              <button
                onClick={() => setSelectedStream(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-muted">Title</p>
                <p className="text-sm font-medium text-text-primary">{selectedStream.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Streamer</p>
                  <p className="text-sm text-text-primary">@{selectedStream.streamerHandle}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Status</p>
                  {getStatusBadge(selectedStream.status)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Current Viewers</p>
                  <p className="text-sm text-text-primary">{formatCount(selectedStream.viewerCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Peak Viewers</p>
                  <p className="text-sm text-text-primary">{formatCount(selectedStream.peakViewers)}</p>
                </div>
              </div>
              {selectedStream.category && (
                <div>
                  <p className="text-xs text-text-muted">Category</p>
                  <p className="text-sm text-text-primary">{selectedStream.category}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-text-muted">Streamer DID</p>
                <p className="text-sm font-mono text-text-primary truncate">{selectedStream.streamerDid}</p>
              </div>
              {selectedStream.status === 'live' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to end this stream?')) {
                        endStreamMutation.mutate(selectedStream.id);
                      }
                    }}
                    disabled={endStreamMutation.isPending}
                    className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {endStreamMutation.isPending ? 'Ending...' : 'End Stream'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  color?: 'red' | 'blue' | 'green';
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colorStyles = {
    red: 'text-red-500 bg-red-500/10',
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color ? colorStyles[color].split(' ')[0] : 'text-text-primary'}`}>
            {value}
          </p>
        </div>
        <div className={`p-3 rounded-lg ${color ? colorStyles[color].split(' ')[1] : 'bg-surface-hover'}`}>
          <Icon className={`w-6 h-6 ${color ? colorStyles[color].split(' ')[0] : 'text-text-muted'}`} />
        </div>
      </div>
    </div>
  );
}

function LiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function ViewersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ScheduleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
