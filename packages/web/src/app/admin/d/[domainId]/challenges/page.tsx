// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface Challenge {
  id: string;
  title: string;
  description?: string;
  hashtag: string;
  status: 'draft' | 'active' | 'ended';
  startDate: string;
  endDate?: string;
  participantCount: number;
  videoCount: number;
}

export default function DomainChallengesPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data: domainData } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: challengesData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'challenges'],
    queryFn: () => api.adminDomainChallengesList(domainId),
    enabled: !!domainId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainChallengesDelete(domainId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'challenges'] });
      toast.success('Challenge deleted');
    },
    onError: () => toast.error('Failed to delete challenge'),
  });

  const domain = domainData?.domain;
  const challenges = challengesData?.challenges || [];

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
      active: 'bg-green-500/10 text-green-400 border-green-500/30',
      ended: 'bg-red-500/10 text-red-400 border-red-500/30',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Challenges</h1>
          <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Create Challenge
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <ChallengeIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No challenges created</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
          >
            Create First Challenge
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {challenges.map((challenge) => (
            <div key={challenge.id} className="bg-surface border border-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(challenge.status)}`}>
                  {challenge.status.charAt(0).toUpperCase() + challenge.status.slice(1)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedChallenge(challenge)}
                    className="p-2 text-text-muted hover:text-text-primary rounded"
                  >
                    <EditIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this challenge?')) deleteMutation.mutate(challenge.id);
                    }}
                    className="p-2 text-text-muted hover:text-red-400 rounded"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">{challenge.title}</h3>
              <p className="text-accent text-sm mt-1">#{challenge.hashtag}</p>
              {challenge.description && (
                <p className="text-text-muted text-sm mt-2 line-clamp-2">{challenge.description}</p>
              )}
              <div className="mt-4 flex items-center gap-4 text-sm text-text-muted">
                <span>{challenge.participantCount} participants</span>
                <span>{challenge.videoCount} videos</span>
              </div>
              <div className="mt-2 text-xs text-text-muted">
                {new Date(challenge.startDate).toLocaleDateString()}
                {challenge.endDate && ` - ${new Date(challenge.endDate).toLocaleDateString()}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateChallengeModal domainId={domainId} onClose={() => setShowCreateModal(false)} />
      )}

      {selectedChallenge && (
        <EditChallengeModal
          challenge={selectedChallenge}
          domainId={domainId}
          onClose={() => setSelectedChallenge(null)}
        />
      )}
    </div>
  );
}

function CreateChallengeModal({ domainId, onClose }: { domainId: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [hashtag, setHashtag] = useState('');
  const [description, setDescription] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { domainId: string; title: string; hashtag: string; description?: string }) =>
      api.adminDomainChallengesCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'challenges'] });
      toast.success('Challenge created');
      onClose();
    },
    onError: () => toast.error('Failed to create challenge'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Create Challenge</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Hashtag</label>
            <input
              type="text"
              value={hashtag}
              onChange={(e) => setHashtag(e.target.value.replace('#', ''))}
              placeholder="Without the #"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate({ domainId, title, hashtag, description: description || undefined })}
            disabled={!title || !hashtag || createMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditChallengeModal({ challenge, domainId, onClose }: { challenge: Challenge; domainId: string; onClose: () => void }) {
  const [title, setTitle] = useState(challenge.title);
  const [description, setDescription] = useState(challenge.description || '');
  const [status, setStatus] = useState(challenge.status);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; domainId: string; title: string; description?: string; status: string }) =>
      api.adminDomainChallengesUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'challenges'] });
      toast.success('Challenge updated');
      onClose();
    },
    onError: () => toast.error('Failed to update challenge'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Edit Challenge</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Challenge['status'])}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => updateMutation.mutate({ id: challenge.id, domainId, title, description: description || undefined, status })}
            disabled={!title || updateMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChallengeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m3.044-1.35a6.726 6.726 0 01-2.748 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
