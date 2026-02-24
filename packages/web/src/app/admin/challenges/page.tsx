'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ChallengeView, ChallengeEntryView } from '@/lib/api';
import toast from 'react-hot-toast';

type ViewMode = 'list' | 'create' | 'edit' | 'entries';

export default function AdminChallengesPage() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeView | null>(null);
  const [formData, setFormData] = useState<Partial<ChallengeView>>({});
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);

  // Fetch challenges
  const { data: challengesData, isLoading } = useQuery({
    queryKey: ['admin', 'challenges', statusFilter],
    queryFn: () => api.adminListChallenges({ status: statusFilter || undefined, limit: 100 }),
  });

  // Fetch challenge stats when viewing entries
  const { data: statsData } = useQuery({
    queryKey: ['admin', 'challenge', selectedChallenge?.id, 'stats'],
    queryFn: () => api.adminGetChallengeStats(selectedChallenge!.id),
    enabled: viewMode === 'entries' && !!selectedChallenge,
  });

  // Fetch leaderboard when viewing entries
  const { data: leaderboardData } = useQuery({
    queryKey: ['admin', 'challenge', selectedChallenge?.id, 'leaderboard'],
    queryFn: () => api.getChallengeLeaderboard(selectedChallenge!.id, { limit: 50 }),
    enabled: viewMode === 'entries' && !!selectedChallenge,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => api.adminCreateChallenge({
      name: data.name!,
      description: data.description,
      hashtag: data.hashtag!,
      rules: data.rules,
      prizes: data.prizes,
      coverImage: data.coverImage,
      startAt: data.startAt!,
      endAt: data.endAt!,
      votingEndAt: data.votingEndAt,
    }),
    onSuccess: () => {
      toast.success('Challenge created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      setViewMode('list');
      setFormData({});
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => api.adminUpdateChallenge({
      id: selectedChallenge!.id,
      name: data.name,
      description: data.description,
      rules: data.rules,
      prizes: data.prizes,
      coverImage: data.coverImage,
      status: data.status,
      startAt: data.startAt,
      endAt: data.endAt,
      votingEndAt: data.votingEndAt,
    }),
    onSuccess: () => {
      toast.success('Challenge updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
      setViewMode('list');
      setFormData({});
      setSelectedChallenge(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDeleteChallenge(id),
    onSuccess: () => {
      toast.success('Challenge deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenges'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setFeaturedMutation = useMutation({
    mutationFn: ({ entryIds, featured }: { entryIds: string[]; featured: boolean }) =>
      api.adminSetChallengeFeatured(selectedChallenge!.id, entryIds, featured),
    onSuccess: () => {
      toast.success('Featured status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenge', selectedChallenge?.id] });
      setSelectedEntries([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setWinnersMutation = useMutation({
    mutationFn: (entryIds: string[]) =>
      api.adminSetChallengeWinners(selectedChallenge!.id, entryIds),
    onSuccess: () => {
      toast.success('Winners set');
      queryClient.invalidateQueries({ queryKey: ['admin', 'challenge', selectedChallenge?.id] });
      setSelectedEntries([]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleEdit = (challenge: ChallengeView) => {
    setSelectedChallenge(challenge);
    setFormData({
      name: challenge.name,
      description: challenge.description,
      hashtag: challenge.hashtag,
      rules: challenge.rules,
      prizes: challenge.prizes,
      coverImage: challenge.coverImage,
      status: challenge.status,
      startAt: challenge.startAt.split('T')[0],
      endAt: challenge.endAt.split('T')[0],
      votingEndAt: challenge.votingEndAt?.split('T')[0],
    });
    setViewMode('edit');
  };

  const handleViewEntries = (challenge: ChallengeView) => {
    setSelectedChallenge(challenge);
    setViewMode('entries');
    setSelectedEntries([]);
  };

  const handleCreate = () => {
    setFormData({});
    setSelectedChallenge(null);
    setViewMode('create');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (viewMode === 'create') {
      createMutation.mutate(formData);
    } else {
      updateMutation.mutate(formData);
    }
  };

  const toggleEntrySelection = (entryId: string) => {
    setSelectedEntries((prev) =>
      prev.includes(entryId)
        ? prev.filter((id) => id !== entryId)
        : [...prev, entryId]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'voting': return 'bg-yellow-500';
      case 'upcoming': return 'bg-blue-500';
      case 'ended': return 'bg-gray-500';
      case 'draft': return 'bg-gray-400';
      default: return 'bg-gray-500';
    }
  };

  // List View
  if (viewMode === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Challenges</h1>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
          >
            Create Challenge
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {['', 'draft', 'upcoming', 'active', 'voting', 'ended'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>

        {/* Challenge List */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-6 animate-pulse">
                <div className="h-6 bg-surface-hover rounded w-1/3 mb-3" />
                <div className="h-4 bg-surface-hover rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : challengesData?.challenges.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl">
            <TrophyIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">No challenges found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {challengesData?.challenges.map((challenge) => (
              <div
                key={challenge.id}
                className="bg-surface border border-border rounded-xl p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg text-text-primary">{challenge.name}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${getStatusColor(challenge.status)}`}>
                        {challenge.status}
                      </span>
                    </div>
                    <p className="text-accent font-medium mb-2">#{challenge.hashtag}</p>
                    <div className="flex gap-6 text-sm text-text-muted">
                      <span>{challenge.entryCount} entries</span>
                      <span>{challenge.participantCount} participants</span>
                      <span>Starts: {new Date(challenge.startAt).toLocaleDateString()}</span>
                      <span>Ends: {new Date(challenge.endAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewEntries(challenge)}
                      className="px-3 py-1.5 text-sm text-text-primary bg-surface-hover rounded-lg hover:bg-border transition-colors"
                    >
                      Entries
                    </button>
                    <button
                      onClick={() => handleEdit(challenge)}
                      className="px-3 py-1.5 text-sm text-accent bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this challenge?')) {
                          deleteMutation.mutate(challenge.id);
                        }
                      }}
                      className="px-3 py-1.5 text-sm text-red-500 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      Delete
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

  // Create/Edit Form
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">
            {viewMode === 'create' ? 'Create Challenge' : 'Edit Challenge'}
          </h1>
          <button
            onClick={() => setViewMode('list')}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Name</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Hashtag</label>
            <div className="flex items-center">
              <span className="text-text-muted mr-2">#</span>
              <input
                type="text"
                value={formData.hashtag || ''}
                onChange={(e) => setFormData({ ...formData, hashtag: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
                className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                required
                disabled={viewMode === 'edit'}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Rules</label>
            <textarea
              value={formData.rules || ''}
              onChange={(e) => setFormData({ ...formData, rules: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Prizes</label>
            <input
              type="text"
              value={formData.prizes || ''}
              onChange={(e) => setFormData({ ...formData, prizes: e.target.value })}
              placeholder="e.g., $500 cash prize, verification badge"
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Cover Image URL</label>
            <input
              type="url"
              value={formData.coverImage || ''}
              onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Start Date</label>
              <input
                type="date"
                value={formData.startAt || ''}
                onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">End Date</label>
              <input
                type="date"
                value={formData.endAt || ''}
                onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Voting End Date (optional)</label>
            <input
              type="date"
              value={formData.votingEndAt || ''}
              onChange={(e) => setFormData({ ...formData, votingEndAt: e.target.value || undefined })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {viewMode === 'edit' && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Status</label>
              <select
                value={formData.status || ''}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as ChallengeView['status'] })}
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="draft">Draft</option>
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="voting">Voting</option>
                <option value="ended">Ended</option>
              </select>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 px-6 py-3 bg-accent text-text-inverse font-medium rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : viewMode === 'create' ? 'Create Challenge' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Entries View
  if (viewMode === 'entries' && selectedChallenge) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => setViewMode('list')}
              className="text-text-muted hover:text-text-primary transition-colors mb-2"
            >
              &larr; Back to challenges
            </button>
            <h1 className="text-2xl font-bold text-text-primary">
              {selectedChallenge.name} - Entries
            </h1>
            <p className="text-accent font-medium">#{selectedChallenge.hashtag}</p>
          </div>
          {selectedEntries.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setFeaturedMutation.mutate({ entryIds: selectedEntries, featured: true })}
                className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
              >
                Feature Selected ({selectedEntries.length})
              </button>
              {selectedChallenge.status === 'ended' || selectedChallenge.status === 'voting' ? (
                <button
                  onClick={() => setWinnersMutation.mutate(selectedEntries)}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                  Set as Winners
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Stats */}
        {statsData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-2xl font-bold text-text-primary">{statsData.stats.totalEntries}</div>
              <div className="text-sm text-text-muted">Total Entries</div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-2xl font-bold text-text-primary">{statsData.stats.totalParticipants}</div>
              <div className="text-sm text-text-muted">Participants</div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-2xl font-bold text-text-primary">{statsData.stats.entriesLast24h}</div>
              <div className="text-sm text-text-muted">Entries (24h)</div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-2xl font-bold text-text-primary">{statsData.stats.avgEngagementScore.toFixed(0)}</div>
              <div className="text-sm text-text-muted">Avg. Engagement</div>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboardData?.entries.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl">
            <VideoIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted">No entries yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboardData?.entries.map((entry, index) => (
              <div
                key={entry.id}
                className={`bg-surface border rounded-xl p-4 cursor-pointer transition-colors ${
                  selectedEntries.includes(entry.id)
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:bg-surface-hover'
                }`}
                onClick={() => toggleEntrySelection(entry.id)}
              >
                <div className="flex items-center gap-4">
                  {/* Selection checkbox */}
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    selectedEntries.includes(entry.id)
                      ? 'border-accent bg-accent'
                      : 'border-border'
                  }`}>
                    {selectedEntries.includes(entry.id) && (
                      <CheckIcon className="w-3 h-3 text-white" />
                    )}
                  </div>

                  {/* Rank */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-yellow-500 text-white' :
                    index === 1 ? 'bg-gray-400 text-white' :
                    index === 2 ? 'bg-amber-600 text-white' :
                    'bg-surface-hover text-text-muted'
                  }`}>
                    {index + 1}
                  </div>

                  {/* Author info */}
                  <div className="flex items-center gap-2 flex-1">
                    {entry.author?.avatar ? (
                      <img src={entry.author.avatar} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-surface-hover" />
                    )}
                    <div>
                      <div className="font-medium text-text-primary">
                        {entry.author?.displayName || entry.author?.handle}
                      </div>
                      <div className="text-xs text-text-muted">@{entry.author?.handle}</div>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex gap-2">
                    {entry.isFeatured && (
                      <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs font-medium rounded">
                        Featured
                      </span>
                    )}
                    {entry.isWinner && (
                      <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded">
                        Winner
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 text-sm text-text-muted">
                    <span>{formatNumber(entry.viewCount)} views</span>
                    <span>{formatNumber(entry.likeCount)} likes</span>
                    <span>{formatNumber(entry.engagementScore)} score</span>
                  </div>

                  {/* Thumbnail */}
                  {entry.video?.video?.thumbnail && (
                    <img
                      src={entry.video.video.thumbnail}
                      alt=""
                      className="w-12 h-16 rounded object-cover"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
