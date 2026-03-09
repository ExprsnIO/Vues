// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

type ModerationTab = 'queue' | 'banned-words' | 'banned-tags';

export default function DomainModerationPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState<ModerationTab>('queue');

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const domain = domainData?.domain;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Moderation</h1>
        <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6">
          {[
            { id: 'queue', label: 'Queue' },
            { id: 'banned-words', label: 'Banned Words' },
            { id: 'banned-tags', label: 'Banned Tags' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ModerationTab)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'queue' && <ModerationQueueTab domainId={domainId} />}
        {activeTab === 'banned-words' && <BannedWordsTab domainId={domainId} />}
        {activeTab === 'banned-tags' && <BannedTagsTab domainId={domainId} />}
      </div>
    </div>
  );
}

function ModerationQueueTab({ domainId }: { domainId: string }) {
  const [statusFilter, setStatusFilter] = useState('pending');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'moderation', 'queue', statusFilter],
    queryFn: () => api.adminDomainModerationQueueList(domainId, { status: statusFilter }),
  });

  const resolveMutation = useMutation({
    mutationFn: (data: { id: string; resolution: string; notes?: string }) =>
      api.adminDomainModerationQueueResolve(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'moderation', 'queue'] });
      toast.success('Item resolved');
    },
    onError: () => toast.error('Failed to resolve item'),
  });

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="removed">Removed</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <ModerationIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No items in the moderation queue</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item: any) => (
            <div key={item.id} className="bg-surface border border-border rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-text-primary font-medium">{item.type}</p>
                  <p className="text-text-muted text-sm mt-1">{item.reason}</p>
                  <p className="text-text-muted text-xs mt-2">
                    Reported {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => resolveMutation.mutate({ id: item.id, resolution: 'approved' })}
                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => resolveMutation.mutate({ id: item.id, resolution: 'removed' })}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BannedWordsTab({ domainId }: { domainId: string }) {
  const [newWord, setNewWord] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'moderation', 'banned-words'],
    queryFn: () => api.adminDomainBannedWordsList(domainId),
  });

  const addMutation = useMutation({
    mutationFn: (word: string) => api.adminDomainBannedWordsAdd(domainId, word),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'moderation', 'banned-words'] });
      setNewWord('');
      toast.success('Word added');
    },
    onError: () => toast.error('Failed to add word'),
  });

  const removeMutation = useMutation({
    mutationFn: (word: string) => api.adminDomainBannedWordsRemove(domainId, word),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'moderation', 'banned-words'] });
      toast.success('Word removed');
    },
    onError: () => toast.error('Failed to remove word'),
  });

  const words = data?.words || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          placeholder="Add banned word..."
          className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
        />
        <button
          onClick={() => newWord && addMutation.mutate(newWord)}
          disabled={!newWord || addMutation.isPending}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : words.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <p className="text-text-muted">No banned words configured</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {words.map((word: string) => (
            <span
              key={word}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-full"
            >
              {word}
              <button onClick={() => removeMutation.mutate(word)} className="hover:text-red-300">
                <XIcon className="w-4 h-4" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BannedTagsTab({ domainId }: { domainId: string }) {
  const [newTag, setNewTag] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'moderation', 'banned-tags'],
    queryFn: () => api.adminDomainBannedTagsList(domainId),
  });

  const addMutation = useMutation({
    mutationFn: (tag: string) => api.adminDomainBannedTagsAdd(domainId, tag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'moderation', 'banned-tags'] });
      setNewTag('');
      toast.success('Tag added');
    },
    onError: () => toast.error('Failed to add tag'),
  });

  const removeMutation = useMutation({
    mutationFn: (tag: string) => api.adminDomainBannedTagsRemove(domainId, tag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'moderation', 'banned-tags'] });
      toast.success('Tag removed');
    },
    onError: () => toast.error('Failed to remove tag'),
  });

  const tags = data?.tags || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add banned tag..."
          className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
        />
        <button
          onClick={() => newTag && addMutation.mutate(newTag.replace('#', ''))}
          disabled={!newTag || addMutation.isPending}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tags.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <p className="text-text-muted">No banned tags configured</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag: string) => (
            <span
              key={tag}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-full"
            >
              #{tag}
              <button onClick={() => removeMutation.mutate(tag)} className="hover:text-red-300">
                <XIcon className="w-4 h-4" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ModerationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
