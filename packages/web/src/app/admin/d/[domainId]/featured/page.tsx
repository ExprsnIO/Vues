// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

export default function DomainFeaturedPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: featuredData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'featured'],
    queryFn: () => api.adminDomainFeaturedList(domainId),
    enabled: !!domainId,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainFeaturedRemove(domainId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'featured'] });
      toast.success('Removed from featured');
    },
    onError: () => toast.error('Failed to remove'),
  });

  const domain = domainData?.domain;
  const featured = featuredData?.featured || [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Featured Content</h1>
          <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Add Featured
        </button>
      </div>

      <div className="bg-surface border border-border rounded-lg p-4">
        <p className="text-text-muted text-sm">
          Featured content appears prominently on the domain's homepage and discovery feeds.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : featured.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <StarIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No featured content</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
          >
            Feature Content
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map((item: any) => (
            <div key={item.id} className="bg-surface border border-border rounded-lg overflow-hidden">
              {item.thumbnail && (
                <div className="aspect-video bg-surface-hover">
                  <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <h3 className="text-text-primary font-medium truncate">{item.title || 'Untitled'}</h3>
                <p className="text-text-muted text-sm mt-1">Featured since {new Date(item.featuredAt).toLocaleDateString()}</p>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => {
                      if (confirm('Remove from featured?')) removeMutation.mutate(item.id);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddFeaturedModal domainId={domainId} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

function AddFeaturedModal({ domainId, onClose }: { domainId: string; onClose: () => void }) {
  const [contentUri, setContentUri] = useState('');
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationFn: (uri: string) => api.adminDomainFeaturedAdd(domainId, uri),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'featured'] });
      toast.success('Added to featured');
      onClose();
    },
    onError: () => toast.error('Failed to add featured'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Add Featured Content</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Content URI</label>
            <input
              type="text"
              value={contentUri}
              onChange={(e) => setContentUri(e.target.value)}
              placeholder="at://..."
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => contentUri && addMutation.mutate(contentUri)}
            disabled={!contentUri || addMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {addMutation.isPending ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}
