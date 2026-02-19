'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ModerationQueueItem, BannedWord, BannedTag } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';

type ModerationTab = 'queue' | 'banned-words' | 'banned-tags';

type ContentFilter = 'all' | 'video' | 'comment' | 'loop' | 'collab' | 'user';
type StatusFilter = 'pending' | 'in_review' | 'escalated' | '';
type PriorityFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';

export default function ModerationDashboardPage() {
  const [activeTab, setActiveTab] = useState<ModerationTab>('queue');
  const [contentFilter, setContentFilter] = useState<ContentFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<ModerationQueueItem | null>(null);
  const queryClient = useQueryClient();

  // Fetch moderation queue
  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['moderation', 'queue', { contentFilter, statusFilter, priorityFilter }],
    queryFn: () =>
      api.getModerationQueue({
        contentType: contentFilter === 'all' ? undefined : contentFilter,
        status: statusFilter || undefined,
        priority: priorityFilter === 'all' ? undefined : priorityFilter,
        limit: 50,
      }),
  });

  // Fetch moderation stats
  const { data: statsData } = useQuery({
    queryKey: ['moderation', 'stats'],
    queryFn: () => api.getModerationStats(),
  });

  // Claim item mutation
  const claimMutation = useMutation({
    mutationFn: (itemId: string) => api.claimModerationItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation'] });
      toast.success('Item claimed');
    },
    onError: () => {
      toast.error('Failed to claim item');
    },
  });

  // Resolve item mutation
  const resolveMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.resolveModerationItem>[0]) =>
      api.resolveModerationItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moderation'] });
      setSelectedItem(null);
      toast.success('Item resolved');
    },
    onError: () => {
      toast.error('Failed to resolve item');
    },
  });

  // Bulk action mutation
  const bulkMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.bulkModerationAction>[0]) =>
      api.bulkModerationAction(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['moderation'] });
      setSelectedItems([]);
      toast.success(`Processed ${result.processed} items`);
    },
    onError: () => {
      toast.error('Failed to process bulk action');
    },
  });

  const queue = queueData?.items || [];
  const queueStats = queueData?.stats;
  const stats = statsData;

  const toggleSelectItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedItems.length === queue.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(queue.map((i) => i.id));
    }
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-500/10 text-gray-500',
      medium: 'bg-yellow-500/10 text-yellow-500',
      high: 'bg-orange-500/10 text-orange-500',
      critical: 'bg-red-500/10 text-red-500',
    };
    return colors[priority] || colors.low;
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <VideoIcon className="w-4 h-4" />;
      case 'comment':
        return <CommentIcon className="w-4 h-4" />;
      case 'loop':
        return <LoopIcon className="w-4 h-4" />;
      case 'collab':
        return <CollabIcon className="w-4 h-4" />;
      case 'user':
        return <UserIcon className="w-4 h-4" />;
      default:
        return <ContentIcon className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Moderation Dashboard</h1>
          <p className="text-text-muted text-sm">Review and moderate reported content</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'queue' && selectedItems.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted">{selectedItems.length} selected</span>
              <button
                onClick={() =>
                  bulkMutation.mutate({
                    itemIds: selectedItems,
                    action: 'approve',
                    reason: 'Bulk approved - no violation found',
                  })
                }
                disabled={bulkMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg transition-colors"
              >
                Approve All
              </button>
              <button
                onClick={() =>
                  bulkMutation.mutate({
                    itemIds: selectedItems,
                    action: 'remove',
                    reason: 'Bulk removed - violation confirmed',
                  })
                }
                disabled={bulkMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                Remove All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'queue'
              ? 'bg-accent text-text-inverse'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <QueueIcon className="w-4 h-4" />
            <span>Moderation Queue</span>
            {queueStats && queueStats.pending > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                {queueStats.pending}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('banned-words')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'banned-words'
              ? 'bg-accent text-text-inverse'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <BannedWordIcon className="w-4 h-4" />
            <span>Banned Words</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('banned-tags')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'banned-tags'
              ? 'bg-accent text-text-inverse'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <TagIcon className="w-4 h-4" />
            <span>Banned Tags</span>
          </div>
        </button>
      </div>

      {/* Queue Tab Content */}
      {activeTab === 'queue' && (
        <>
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
          label="Pending"
          value={queueStats?.pending || 0}
          color="text-yellow-500"
          bgColor="bg-yellow-500/10"
          icon={<ClockIcon className="w-5 h-5" />}
        />
        <StatCard
          label="In Review"
          value={queueStats?.inReview || 0}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
          icon={<EyeIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Escalated"
          value={queueStats?.escalated || 0}
          color="text-red-500"
          bgColor="bg-red-500/10"
          icon={<AlertIcon className="w-5 h-5" />}
        />
        <StatCard
          label="Resolved Today"
          value={queueStats?.resolvedToday || 0}
          color="text-green-500"
          bgColor="bg-green-500/10"
          icon={<CheckIcon className="w-5 h-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-surface rounded-xl border border-border">
        <div>
          <label className="block text-xs text-text-muted mb-1">Content Type</label>
          <select
            value={contentFilter}
            onChange={(e) => setContentFilter(e.target.value as ContentFilter)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">All Types</option>
            <option value="video">Videos</option>
            <option value="comment">Comments</option>
            <option value="loop">Loops</option>
            <option value="collab">Collabs</option>
            <option value="user">Users</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="pending">Pending</option>
            <option value="in_review">In Review</option>
            <option value="escalated">Escalated</option>
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Priority</label>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            className="px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">All Priorities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="flex-1" />
        <div className="flex items-end">
          <Link
            href="/admin/reports"
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            View All Reports
          </Link>
        </div>
      </div>

      {/* Queue Table */}
      {queueLoading ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : queue.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Queue is clear!</h2>
          <p className="text-text-muted">No items matching your filters need review.</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === queue.length && queue.length > 0}
                    onChange={selectAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Content</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Priority</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Reports</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Reasons</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queue.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => setSelectedItem(item)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={() => toggleSelectItem(item.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.content.thumbnail ? (
                        <img
                          src={item.content.thumbnail}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                          {getContentTypeIcon(item.contentType)}
                        </div>
                      )}
                      <div className="max-w-xs">
                        <p className="text-sm text-text-primary truncate">
                          {item.content.text || item.contentUri.split('/').pop()}
                        </p>
                        <p className="text-xs text-text-muted">@{item.content.author.handle}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm text-text-secondary capitalize">
                      {getContentTypeIcon(item.contentType)}
                      {item.contentType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(item.priority)}`}>
                      {item.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium bg-red-500/10 text-red-500 rounded-full">
                      {item.reportCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.reasons.slice(0, 2).map((reason, i) => (
                        <span key={i} className="px-2 py-0.5 text-xs bg-surface-hover text-text-secondary rounded">
                          {reason}
                        </span>
                      ))}
                      {item.reasons.length > 2 && (
                        <span className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded">
                          +{item.reasons.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      item.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                      item.status === 'in_review' ? 'bg-blue-500/10 text-blue-500' :
                      item.status === 'escalated' ? 'bg-red-500/10 text-red-500' :
                      'bg-green-500/10 text-green-500'
                    }`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {item.status === 'pending' && (
                        <button
                          onClick={() => claimMutation.mutate(item.id)}
                          disabled={claimMutation.isPending}
                          className="px-3 py-1 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors"
                        >
                          Claim
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                      >
                        Review
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Moderator Activity */}
      {stats && stats.byModerator.length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* By Content Type */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Reports by Type</h3>
            <div className="space-y-3">
              {Object.entries(stats.byContentType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getContentTypeIcon(type)}
                    <span className="text-text-secondary capitalize">{type}</span>
                  </div>
                  <span className="text-text-primary font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Moderators */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Top Moderators Today</h3>
            <div className="space-y-3">
              {stats.byModerator.slice(0, 5).map((mod, i) => (
                <div key={mod.moderator.did} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    {mod.moderator.avatar ? (
                      <img src={mod.moderator.avatar} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center text-text-muted text-sm">
                        {mod.moderator.handle[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-text-primary">@{mod.moderator.handle}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-text-primary font-medium">{mod.resolved}</p>
                    <p className="text-xs text-text-muted">resolved</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Banned Words Tab Content */}
      {activeTab === 'banned-words' && (
        <BannedWordsSection />
      )}

      {/* Banned Tags Tab Content */}
      {activeTab === 'banned-tags' && (
        <BannedTagsSection />
      )}

      {/* Review Modal */}
      {selectedItem && (
        <ReviewModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onResolve={(action, reason, sanctionType, sanctionDuration) => {
            resolveMutation.mutate({
              itemId: selectedItem.id,
              action,
              reason,
              sanctionType,
              sanctionDuration,
            });
          }}
          isLoading={resolveMutation.isPending}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  bgColor,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={`p-2 rounded-lg ${bgColor} ${color}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value.toLocaleString()}</p>
      <p className="text-sm text-text-muted">{label}</p>
    </div>
  );
}

function ReviewModal({
  item,
  onClose,
  onResolve,
  isLoading,
}: {
  item: ModerationQueueItem;
  onClose: () => void;
  onResolve: (
    action: 'approve' | 'remove' | 'warn' | 'escalate',
    reason: string,
    sanctionType?: 'warning' | 'mute' | 'suspend' | 'ban',
    sanctionDuration?: number
  ) => void;
  isLoading: boolean;
}) {
  const [action, setAction] = useState<'approve' | 'remove' | 'warn' | 'escalate'>('approve');
  const [reason, setReason] = useState('');
  const [sanctionType, setSanctionType] = useState<'warning' | 'mute' | 'suspend' | 'ban'>('warning');
  const [sanctionDuration, setSanctionDuration] = useState(7);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl w-full max-w-3xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Review Content</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Content Preview */}
            <div>
              <h3 className="text-sm font-medium text-text-muted mb-3">Content</h3>
              {item.content.thumbnail && (
                <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4">
                  <img src={item.content.thumbnail} alt="" className="w-full h-full object-contain" />
                </div>
              )}
              {item.content.text && (
                <div className="p-4 bg-surface rounded-xl mb-4">
                  <p className="text-text-primary whitespace-pre-wrap">{item.content.text}</p>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 bg-surface rounded-lg">
                {item.content.author.avatar ? (
                  <img src={item.content.author.avatar} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-text-muted">
                    {item.content.author.handle[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-text-primary font-medium">
                    {item.content.author.displayName || item.content.author.handle}
                  </p>
                  <p className="text-sm text-text-muted">@{item.content.author.handle}</p>
                </div>
              </div>
            </div>

            {/* Reports */}
            <div>
              <h3 className="text-sm font-medium text-text-muted mb-3">
                Reports ({item.reports.length})
              </h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {item.reports.map((report) => (
                  <div key={report.id} className="p-3 bg-surface rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-1 text-xs font-medium bg-red-500/10 text-red-500 rounded-full">
                        {report.reason}
                      </span>
                      <span className="text-xs text-text-muted">
                        {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {report.description && (
                      <p className="text-sm text-text-secondary mb-2">{report.description}</p>
                    )}
                    <p className="text-xs text-text-muted">by @{report.reporter.handle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Form */}
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-medium text-text-muted mb-4">Take Action</h3>

            {/* Action Buttons */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {(['approve', 'remove', 'warn', 'escalate'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={`py-3 px-4 rounded-xl font-medium text-sm transition-colors ${
                    action === a
                      ? a === 'approve' ? 'bg-green-500 text-white' :
                        a === 'remove' ? 'bg-red-500 text-white' :
                        a === 'warn' ? 'bg-yellow-500 text-white' :
                        'bg-orange-500 text-white'
                      : 'bg-surface hover:bg-surface-hover text-text-primary'
                  }`}
                >
                  {a === 'approve' && 'Approve'}
                  {a === 'remove' && 'Remove'}
                  {a === 'warn' && 'Warn User'}
                  {a === 'escalate' && 'Escalate'}
                </button>
              ))}
            </div>

            {/* Sanction Options (for warn action) */}
            {action === 'warn' && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-2">
                    Sanction Type
                  </label>
                  <select
                    value={sanctionType}
                    onChange={(e) => setSanctionType(e.target.value as typeof sanctionType)}
                    className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="warning">Warning</option>
                    <option value="mute">Mute</option>
                    <option value="suspend">Suspend</option>
                    <option value="ban">Ban</option>
                  </select>
                </div>
                {sanctionType !== 'warning' && sanctionType !== 'ban' && (
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">
                      Duration (days)
                    </label>
                    <input
                      type="number"
                      value={sanctionDuration}
                      onChange={(e) => setSanctionDuration(parseInt(e.target.value) || 7)}
                      min={1}
                      max={365}
                      className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Reason */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-muted mb-2">
                Reason / Notes
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Provide a reason for this action..."
                rows={3}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2 text-text-primary hover:bg-surface rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onResolve(
              action,
              reason || `${action.charAt(0).toUpperCase() + action.slice(1)} - no additional notes`,
              action === 'warn' ? sanctionType : undefined,
              action === 'warn' && sanctionType !== 'warning' && sanctionType !== 'ban' ? sanctionDuration : undefined
            )}
            disabled={isLoading}
            className={`px-6 py-2 font-medium rounded-lg transition-colors disabled:opacity-50 ${
              action === 'approve' ? 'bg-green-500 hover:bg-green-600 text-white' :
              action === 'remove' ? 'bg-red-500 hover:bg-red-600 text-white' :
              action === 'warn' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' :
              'bg-orange-500 hover:bg-orange-600 text-white'
            }`}
          >
            {isLoading ? 'Processing...' : `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function BannedWordsSection() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWord, setEditingWord] = useState<BannedWord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: wordsData, isLoading } = useQuery({
    queryKey: ['bannedWords'],
    queryFn: () => api.getBannedWords({ limit: 100 }),
  });

  const addMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.addBannedWord>[0]) => api.addBannedWord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedWords'] });
      setShowAddModal(false);
      toast.success('Banned word added');
    },
    onError: () => {
      toast.error('Failed to add banned word');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateBannedWord>[0]) => api.updateBannedWord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedWords'] });
      setEditingWord(null);
      toast.success('Banned word updated');
    },
    onError: () => {
      toast.error('Failed to update banned word');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeBannedWord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedWords'] });
      toast.success('Banned word removed');
    },
    onError: () => {
      toast.error('Failed to remove banned word');
    },
  });

  const words = wordsData?.words || [];
  const filteredWords = searchQuery
    ? words.filter((w) => w.word.toLowerCase().includes(searchQuery.toLowerCase()))
    : words;

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-yellow-500/10 text-yellow-500',
      medium: 'bg-orange-500/10 text-orange-500',
      high: 'bg-red-500/10 text-red-500',
    };
    return colors[severity] || colors.low;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      flag: 'bg-blue-500/10 text-blue-500',
      block: 'bg-red-500/10 text-red-500',
      shadow: 'bg-purple-500/10 text-purple-500',
    };
    return colors[action] || colors.flag;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Banned Words</h2>
          <p className="text-sm text-text-muted">Manage words that are automatically flagged or blocked</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg font-medium hover:bg-accent-hover transition-colors"
        >
          Add Word
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search banned words..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : filteredWords.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <BannedWordIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <h3 className="text-lg font-medium text-text-primary mb-1">No banned words</h3>
          <p className="text-text-muted text-sm">Add words to automatically flag or block content</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Word</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Severity</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Action</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Matches</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredWords.map((word) => (
                <tr key={word.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-text-primary font-medium font-mono">{word.word}</p>
                      {word.reason && (
                        <p className="text-xs text-text-muted mt-0.5">{word.reason}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(word.severity)}`}>
                      {word.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(word.action)}`}>
                      {word.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-secondary">{word.matchCount.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateMutation.mutate({ id: word.id, enabled: !word.enabled })}
                      disabled={updateMutation.isPending}
                      className={`px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                        word.enabled
                          ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                          : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'
                      }`}
                    >
                      {word.enabled ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingWord(word)}
                        className="px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove "${word.word}" from banned words?`)) {
                            removeMutation.mutate(word.id);
                          }
                        }}
                        disabled={removeMutation.isPending}
                        className="px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingWord) && (
        <BannedWordModal
          word={editingWord}
          onClose={() => {
            setShowAddModal(false);
            setEditingWord(null);
          }}
          onSave={(data) => {
            if (editingWord) {
              updateMutation.mutate({ id: editingWord.id, ...data });
            } else {
              addMutation.mutate(data as Parameters<typeof api.addBannedWord>[0]);
            }
          }}
          isLoading={addMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function BannedWordModal({
  word,
  onClose,
  onSave,
  isLoading,
}: {
  word: BannedWord | null;
  onClose: () => void;
  onSave: (data: { word?: string; severity?: 'low' | 'medium' | 'high'; action?: 'flag' | 'block' | 'shadow'; reason?: string }) => void;
  isLoading: boolean;
}) {
  const [wordText, setWordText] = useState(word?.word || '');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>(word?.severity || 'medium');
  const [action, setAction] = useState<'flag' | 'block' | 'shadow'>(word?.action || 'flag');
  const [reason, setReason] = useState(word?.reason || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold text-text-primary">
            {word ? 'Edit Banned Word' : 'Add Banned Word'}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Word</label>
            <input
              type="text"
              value={wordText}
              onChange={(e) => setWordText(e.target.value)}
              placeholder="Enter word or phrase..."
              disabled={!!word}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="flag">Flag for review</option>
                <option value="block">Block content</option>
                <option value="shadow">Shadow ban</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this word banned?"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
        <div className="p-6 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-text-primary hover:bg-surface rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ word: word ? undefined : wordText, severity, action, reason: reason || undefined })}
            disabled={isLoading || (!word && !wordText.trim())}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : word ? 'Update' : 'Add Word'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BannedTagsSection() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTag, setEditingTag] = useState<BannedTag | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  const { data: tagsData, isLoading } = useQuery({
    queryKey: ['bannedTags'],
    queryFn: () => api.getBannedTags({ limit: 100 }),
  });

  const addMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.addBannedTag>[0]) => api.addBannedTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedTags'] });
      setShowAddModal(false);
      toast.success('Banned tag added');
    },
    onError: () => {
      toast.error('Failed to add banned tag');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateBannedTag>[0]) => api.updateBannedTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedTags'] });
      setEditingTag(null);
      toast.success('Banned tag updated');
    },
    onError: () => {
      toast.error('Failed to update banned tag');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeBannedTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannedTags'] });
      toast.success('Banned tag removed');
    },
    onError: () => {
      toast.error('Failed to remove banned tag');
    },
  });

  const tags = tagsData?.tags || [];
  const filteredTags = searchQuery
    ? tags.filter((t) => t.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    : tags;

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-yellow-500/10 text-yellow-500',
      medium: 'bg-orange-500/10 text-orange-500',
      high: 'bg-red-500/10 text-red-500',
    };
    return colors[severity] || colors.low;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      flag: 'bg-blue-500/10 text-blue-500',
      block: 'bg-red-500/10 text-red-500',
      shadow: 'bg-purple-500/10 text-purple-500',
    };
    return colors[action] || colors.flag;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Banned Tags</h2>
          <p className="text-sm text-text-muted">Manage hashtags that are automatically flagged or blocked</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg font-medium hover:bg-accent-hover transition-colors"
        >
          Add Tag
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search banned tags..."
          className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : filteredTags.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <TagIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <h3 className="text-lg font-medium text-text-primary mb-1">No banned tags</h3>
          <p className="text-text-muted text-sm">Add hashtags to automatically flag or block content</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Tag</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Severity</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Action</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Matches</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTags.map((tag) => (
                <tr key={tag.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-text-primary font-medium">
                        <span className="text-accent">#</span>{tag.tag}
                      </p>
                      {tag.reason && (
                        <p className="text-xs text-text-muted mt-0.5">{tag.reason}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(tag.severity)}`}>
                      {tag.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(tag.action)}`}>
                      {tag.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-secondary">{tag.matchCount.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateMutation.mutate({ id: tag.id, enabled: !tag.enabled })}
                      disabled={updateMutation.isPending}
                      className={`px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                        tag.enabled
                          ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                          : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'
                      }`}
                    >
                      {tag.enabled ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingTag(tag)}
                        className="px-3 py-1 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove "#${tag.tag}" from banned tags?`)) {
                            removeMutation.mutate(tag.id);
                          }
                        }}
                        disabled={removeMutation.isPending}
                        className="px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingTag) && (
        <BannedTagModal
          tag={editingTag}
          onClose={() => {
            setShowAddModal(false);
            setEditingTag(null);
          }}
          onSave={(data) => {
            if (editingTag) {
              updateMutation.mutate({ id: editingTag.id, ...data });
            } else {
              addMutation.mutate(data as Parameters<typeof api.addBannedTag>[0]);
            }
          }}
          isLoading={addMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function BannedTagModal({
  tag,
  onClose,
  onSave,
  isLoading,
}: {
  tag: BannedTag | null;
  onClose: () => void;
  onSave: (data: { tag?: string; severity?: 'low' | 'medium' | 'high'; action?: 'flag' | 'block' | 'shadow'; reason?: string }) => void;
  isLoading: boolean;
}) {
  const [tagText, setTagText] = useState(tag?.tag || '');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>(tag?.severity || 'medium');
  const [action, setAction] = useState<'flag' | 'block' | 'shadow'>(tag?.action || 'flag');
  const [reason, setReason] = useState(tag?.reason || '');

  // Remove # prefix if user types it
  const handleTagChange = (value: string) => {
    setTagText(value.replace(/^#/, ''));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold text-text-primary">
            {tag ? 'Edit Banned Tag' : 'Add Banned Tag'}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Tag</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-medium">#</span>
              <input
                type="text"
                value={tagText}
                onChange={(e) => handleTagChange(e.target.value)}
                placeholder="Enter hashtag..."
                disabled={!!tag}
                className="w-full pl-8 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="flag">Flag for review</option>
                <option value="block">Block content</option>
                <option value="shadow">Shadow ban</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this tag banned?"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
        <div className="p-6 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-text-primary hover:bg-surface rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ tag: tag ? undefined : tagText, severity, action, reason: reason || undefined })}
            disabled={isLoading || (!tag && !tagText.trim())}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : tag ? 'Update' : 'Add Tag'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Icons
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function CommentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function LoopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
    </svg>
  );
}

function CollabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
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

function QueueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
    </svg>
  );
}

function BannedWordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}
