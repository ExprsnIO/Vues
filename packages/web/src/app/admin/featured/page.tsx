'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function AdminFeaturedPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'featured'],
    queryFn: () => api.getFeaturedContent(),
  });

  const removeMutation = useMutation({
    mutationFn: (contentUri: string) => api.removeFeaturedContent(contentUri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'featured'] });
      toast.success('Content removed from featured');
    },
    onError: () => toast.error('Failed to remove content'),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ contentUri, position }: { contentUri: string; position: number }) =>
      api.updateFeaturedContent({ contentUri, position }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'featured'] });
    },
    onError: () => toast.error('Failed to reorder content'),
  });

  const featured = data?.featured || [];

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newPosition = direction === 'up' ? index - 1 : index + 1;
    if (newPosition < 0 || newPosition >= featured.length) return;
    reorderMutation.mutate({
      contentUri: featured[index].contentUri,
      position: newPosition,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Featured Content</h1>
          <p className="text-text-muted text-sm mt-1">
            Manage videos that appear in the featured section
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Featured
        </button>
      </div>

      {/* Featured List */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-text-muted">Loading...</div>
        ) : featured.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            No featured content yet. Add some videos to feature them on the home page.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {featured.map((item: any, index: number) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 hover:bg-surface-hover transition-colors"
              >
                {/* Position Controls */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveItem(index, 'up')}
                    disabled={index === 0 || reorderMutation.isPending}
                    className="p-1 rounded hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronUpIcon className="w-4 h-4 text-text-muted" />
                  </button>
                  <button
                    onClick={() => moveItem(index, 'down')}
                    disabled={index === featured.length - 1 || reorderMutation.isPending}
                    className="p-1 rounded hover:bg-border disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronDownIcon className="w-4 h-4 text-text-muted" />
                  </button>
                </div>

                {/* Position Number */}
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent font-semibold text-sm">
                  {index + 1}
                </div>

                {/* Thumbnail */}
                <div className="w-20 h-12 rounded-lg bg-surface-hover overflow-hidden flex-shrink-0">
                  {item.video?.thumbnailUrl ? (
                    <img
                      src={item.video.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoIcon className="w-6 h-6 text-text-muted" />
                    </div>
                  )}
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary truncate">
                    {item.video?.caption || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-text-muted">
                    <span>@{item.video?.author?.handle || 'unknown'}</span>
                    <span>{formatCount(item.video?.viewCount || 0)} views</span>
                    <span>{formatCount(item.video?.likeCount || 0)} likes</span>
                  </div>
                </div>

                {/* Feature Type Badge */}
                <div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getFeatureTypeColor(
                      item.featureType
                    )}`}
                  >
                    {item.featureType}
                  </span>
                </div>

                {/* Dates */}
                <div className="text-right text-sm">
                  <p className="text-text-primary">
                    Added {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                  {item.expiresAt && (
                    <p className="text-text-muted">
                      Expires {new Date(item.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => {
                    if (confirm('Remove this content from featured?')) {
                      removeMutation.mutate(item.contentUri);
                    }
                  }}
                  disabled={removeMutation.isPending}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feature Types Guide */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Feature Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-surface-hover rounded-lg">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFeatureTypeColor('hero')}`}>
              hero
            </span>
            <p className="text-sm text-text-muted mt-2">
              Large featured spot at the top of the home feed
            </p>
          </div>
          <div className="p-4 bg-surface-hover rounded-lg">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFeatureTypeColor('trending')}`}>
              trending
            </span>
            <p className="text-sm text-text-muted mt-2">
              Appears in the trending section carousel
            </p>
          </div>
          <div className="p-4 bg-surface-hover rounded-lg">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFeatureTypeColor('recommended')}`}>
              recommended
            </span>
            <p className="text-sm text-text-muted mt-2">
              Boosted in personalized recommendations
            </p>
          </div>
          <div className="p-4 bg-surface-hover rounded-lg">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getFeatureTypeColor('spotlight')}`}>
              spotlight
            </span>
            <p className="text-sm text-text-muted mt-2">
              Creator spotlight or special promotion
            </p>
          </div>
        </div>
      </div>

      {/* Add Featured Modal */}
      {showAddModal && (
        <AddFeaturedModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'featured'] });
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

function AddFeaturedModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [videoUri, setVideoUri] = useState('');
  const [featureType, setFeatureType] = useState<'hero' | 'trending' | 'recommended' | 'spotlight'>(
    'trending'
  );
  const [expiresIn, setExpiresIn] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!videoUri.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      let expiresAt: string | undefined;
      if (expiresIn) {
        const days = parseInt(expiresIn);
        if (!isNaN(days) && days > 0) {
          const date = new Date();
          date.setDate(date.getDate() + days);
          expiresAt = date.toISOString();
        }
      }

      await api.addFeaturedContent({
        contentUri: videoUri.trim(),
        featureType,
        expiresAt,
      });

      toast.success('Content featured');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to feature content');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add Featured Content</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Video URI</label>
            <input
              type="text"
              value={videoUri}
              onChange={(e) => setVideoUri(e.target.value)}
              placeholder="at://did:plc:.../io.exprsn.video.post/..."
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
            />
            <p className="text-xs text-text-muted mt-1">
              The AT Protocol URI of the video to feature
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Feature Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['hero', 'trending', 'recommended', 'spotlight'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFeatureType(type)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors capitalize ${
                    featureType === type
                      ? getFeatureTypeColor(type)
                      : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">
              Expires In (days)
            </label>
            <input
              type="number"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
              placeholder="Leave empty for no expiration"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !videoUri.trim()}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Adding...' : 'Add Featured'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getFeatureTypeColor(type: string): string {
  const colors: Record<string, string> = {
    hero: 'bg-purple-500/10 text-purple-500',
    trending: 'bg-orange-500/10 text-orange-500',
    recommended: 'bg-blue-500/10 text-blue-500',
    spotlight: 'bg-green-500/10 text-green-500',
  };
  return colors[type] || 'bg-gray-500/10 text-gray-400';
}

function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
