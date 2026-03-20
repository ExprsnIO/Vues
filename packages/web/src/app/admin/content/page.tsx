'use client';

import { Suspense, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FilterBar } from '@/components/admin/ui/FilterBar';
import { useAdminFilters } from '@/hooks/useAdminFilters';
import toast from 'react-hot-toast';

type ContentType = 'video' | 'comment';
type ContentStatus = 'active' | 'removed' | 'flagged' | '';

interface ContentItem {
  uri: string;
  type: ContentType;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  text?: string;
  thumbnail?: string;
  viewCount?: number;
  likeCount?: number;
  reportCount: number;
  status: 'active' | 'removed' | 'flagged';
  createdAt: string;
  removedAt?: string;
  removedReason?: string;
}

export default function AdminContentPage() {
  return (
    <Suspense>
      <AdminContentContent />
    </Suspense>
  );
}

function AdminContentContent() {
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [actionModal, setActionModal] = useState<'remove' | 'restore' | null>(null);
  const queryClient = useQueryClient();

  const filters = useAdminFilters({
    syncWithUrl: true,
  });

  const contentType = (filters.filters.type?.[0] || '') as ContentType | '';
  const status = (filters.filters.status?.[0] || '') as ContentStatus;

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'content', { type: contentType, status, q: filters.search }],
    queryFn: () =>
      api.getAdminContent({
        type: contentType || undefined,
        status: status || undefined,
        q: filters.search || undefined,
        limit: 50,
      }),
  });

  const removeMutation = useMutation({
    mutationFn: (data: { uri: string; reason: string }) => api.removeAdminContent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setSelectedContent(null);
      setActionModal(null);
      toast.success('Content removed successfully');
    },
    onError: () => {
      toast.error('Failed to remove content');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (data: { uri: string; reason?: string }) => api.restoreAdminContent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setSelectedContent(null);
      setActionModal(null);
      toast.success('Content restored successfully');
    },
    onError: () => {
      toast.error('Failed to restore content');
    },
  });

  const content = data?.content || [];

  const filterConfig = useMemo(() => [
    {
      key: 'type',
      label: 'Type',
      multiple: false,
      options: [
        { value: 'video', label: 'Videos' },
        { value: 'comment', label: 'Comments' },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      multiple: false,
      options: [
        { value: 'active', label: 'Active' },
        { value: 'flagged', label: 'Flagged' },
        { value: 'removed', label: 'Removed' },
      ],
    },
  ], []);

  const getStatusBadge = (contentStatus: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/10 text-green-500',
      removed: 'bg-red-500/10 text-red-500',
      flagged: 'bg-yellow-500/10 text-yellow-500',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[contentStatus] || 'bg-gray-500/10 text-gray-500'}`}>
        {contentStatus}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Content Moderation</h1>
        <div className="text-sm text-text-muted">
          {content.length} items
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        filterConfig={filterConfig}
        searchPlaceholder="Search by URI, handle, or content..."
        pageKey="admin-content"
      />

      {/* Content List */}
      {isLoading ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-red-500">
          Failed to load content. Please try again.
        </div>
      ) : content.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center">
          <ContentIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">No content found</h2>
          <p className="text-text-muted">
            {filters.search || contentType || status
              ? 'Try adjusting your filters'
              : 'Content will appear here as it is created'}
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Content</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Author</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Reports</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-muted">Date</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {content.map((item) => (
                <tr
                  key={item.uri}
                  className="hover:bg-surface-hover transition-colors cursor-pointer"
                  onClick={() => setSelectedContent(item)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.type === 'video' && item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="w-12 h-12 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-background rounded-lg flex items-center justify-center">
                          {item.type === 'video' ? (
                            <VideoIcon className="w-5 h-5 text-text-muted" />
                          ) : (
                            <CommentIcon className="w-5 h-5 text-text-muted" />
                          )}
                        </div>
                      )}
                      <div className="max-w-xs">
                        <p className="text-sm text-text-primary truncate">
                          {item.text || item.uri.split('/').pop()}
                        </p>
                        {item.type === 'video' && (
                          <p className="text-xs text-text-muted">
                            {item.viewCount?.toLocaleString() || 0} views
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.author?.avatar ? (
                        <img
                          src={item.author.avatar}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-background flex items-center justify-center text-xs text-text-muted">
                          {item.author?.handle?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="text-sm text-text-primary">@{item.author?.handle || 'unknown'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-secondary capitalize">{item.type}</span>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                  <td className="px-4 py-3">
                    {item.reportCount > 0 ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-500/10 text-red-500">
                        {item.reportCount}
                      </span>
                    ) : (
                      <span className="text-sm text-text-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-text-muted">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'removed' ? (
                        <button
                          onClick={() => {
                            setSelectedContent(item);
                            setActionModal('restore');
                          }}
                          className="px-3 py-1 text-xs font-medium text-green-500 hover:bg-green-500/10 rounded-lg transition-colors"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedContent(item);
                            setActionModal('remove');
                          }}
                          className="px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Content Detail Modal */}
      {selectedContent && !actionModal && (
        <ContentDetailModal
          content={selectedContent}
          onClose={() => setSelectedContent(null)}
          onRemove={() => setActionModal('remove')}
          onRestore={() => setActionModal('restore')}
        />
      )}

      {/* Remove Modal */}
      {actionModal === 'remove' && selectedContent && (
        <ActionModal
          title="Remove Content"
          description="This will remove the content from the platform. Users will no longer be able to view it."
          actionLabel="Remove Content"
          actionColor="bg-red-500 hover:bg-red-600"
          requireReason
          isLoading={removeMutation.isPending}
          onClose={() => {
            setActionModal(null);
            setSelectedContent(null);
          }}
          onAction={(reason) => {
            removeMutation.mutate({ uri: selectedContent.uri, reason });
          }}
        />
      )}

      {/* Restore Modal */}
      {actionModal === 'restore' && selectedContent && (
        <ActionModal
          title="Restore Content"
          description="This will restore the content and make it visible again on the platform."
          actionLabel="Restore Content"
          actionColor="bg-green-500 hover:bg-green-600"
          requireReason={false}
          isLoading={restoreMutation.isPending}
          onClose={() => {
            setActionModal(null);
            setSelectedContent(null);
          }}
          onAction={(reason) => {
            restoreMutation.mutate({ uri: selectedContent.uri, reason: reason || undefined });
          }}
        />
      )}
    </div>
  );
}

function ContentDetailModal({
  content,
  onClose,
  onRemove,
  onRestore,
}: {
  content: ContentItem;
  onClose: () => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-text-primary mb-6">Content Details</h2>

        <div className="space-y-6">
          {/* Preview */}
          {content.type === 'video' && content.thumbnail && (
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              <img
                src={content.thumbnail}
                alt=""
                className="w-full h-full object-contain"
              />
            </div>
          )}

          {/* Content Text */}
          {content.text && (
            <div className="p-4 bg-surface rounded-xl">
              <p className="text-text-primary whitespace-pre-wrap">{content.text}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Author</label>
              <div className="flex items-center gap-2">
                {content.author.avatar ? (
                  <img src={content.author.avatar} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-sm text-text-muted">
                    {content.author.handle[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-text-primary font-medium">{content.author.displayName || content.author.handle}</p>
                  <p className="text-sm text-text-muted">@{content.author.handle}</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Status</label>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                  content.status === 'active' ? 'bg-green-500/10 text-green-500' :
                  content.status === 'removed' ? 'bg-red-500/10 text-red-500' :
                  'bg-yellow-500/10 text-yellow-500'
                }`}>
                  {content.status}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Type</label>
              <p className="text-text-primary capitalize">{content.type}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Reports</label>
              <p className="text-text-primary">{content.reportCount}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Created</label>
              <p className="text-text-primary">{new Date(content.createdAt).toLocaleString()}</p>
            </div>

            {content.removedAt && (
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Removed</label>
                <p className="text-text-primary">{new Date(content.removedAt).toLocaleString()}</p>
              </div>
            )}
          </div>

          {content.removedReason && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">Removal Reason</label>
              <p className="text-text-primary p-3 bg-surface rounded-lg">{content.removedReason}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">URI</label>
            <p className="text-text-secondary text-sm font-mono break-all p-2 bg-surface rounded">{content.uri}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              onClick={onClose}
              className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors"
            >
              Close
            </button>
            {content.status === 'removed' ? (
              <button
                onClick={onRestore}
                className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                Restore
              </button>
            ) : (
              <button
                onClick={onRemove}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionModal({
  title,
  description,
  actionLabel,
  actionColor,
  requireReason,
  isLoading,
  onClose,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionColor: string;
  requireReason: boolean;
  isLoading: boolean;
  onClose: () => void;
  onAction: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-text-muted mb-6">{description}</p>

        <div className="mb-6">
          <label className="block text-sm font-medium text-text-muted mb-2">
            Reason {!requireReason && '(optional)'}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide a reason for this action..."
            className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            rows={3}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onAction(reason)}
            disabled={isLoading || (requireReason && !reason.trim())}
            className={`flex-1 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${actionColor}`}
          >
            {isLoading ? 'Processing...' : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
