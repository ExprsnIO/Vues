'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface QueueItem {
  id: string;
  videoUri: string;
  authorDid: string;
  riskScore: number;
  riskLevel: string;
  flags: string[];
  status: string;
  priority: number;
  assignedTo?: string;
  submittedAt: string;
}

interface QueueResponse {
  items: QueueItem[];
  cursor?: string;
  total: number;
}

type StatusFilter = 'all' | 'pending' | 'in_review' | 'escalated';
type RiskFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';

export default function ModerationQueuePage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const { data: queueData, isLoading } = useQuery<QueueResponse>({
    queryKey: ['moderation-queue', statusFilter, riskFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (riskFilter !== 'all') params.set('riskLevel', riskFilter);
      params.set('limit', '50');

      const response = await fetch(`/api/xrpc/io.exprsn.moderation.getQueue?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch queue');
      return response.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ videoUri, notes }: { videoUri: string; notes?: string }) => {
      const response = await fetch('/api/xrpc/io.exprsn.moderation.approveVideo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUri, notes }),
      });
      if (!response.ok) throw new Error('Failed to approve video');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Video approved');
      setSelectedItem(null);
      setActionNotes('');
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    },
    onError: () => {
      toast.error('Failed to approve video');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ videoUri, reason, notes }: { videoUri: string; reason: string; notes?: string }) => {
      const response = await fetch('/api/xrpc/io.exprsn.moderation.rejectVideo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUri, reason, notes }),
      });
      if (!response.ok) throw new Error('Failed to reject video');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Video rejected');
      setSelectedItem(null);
      setRejectReason('');
      setActionNotes('');
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    },
    onError: () => {
      toast.error('Failed to reject video');
    },
  });

  const escalateMutation = useMutation({
    mutationFn: async ({ videoUri, reason }: { videoUri: string; reason: string }) => {
      const response = await fetch('/api/xrpc/io.exprsn.moderation.escalateVideo', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUri, reason }),
      });
      if (!response.ok) throw new Error('Failed to escalate video');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Video escalated');
      setSelectedItem(null);
      setActionNotes('');
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    },
    onError: () => {
      toast.error('Failed to escalate video');
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ queueId }: { queueId: string }) => {
      const response = await fetch('/api/xrpc/io.exprsn.moderation.assignToModerator', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId }),
      });
      if (!response.ok) throw new Error('Failed to assign item');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Assigned to you');
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
    },
    onError: () => {
      toast.error('Failed to assign item');
    },
  });

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-500 text-white';
      case 'medium':
        return 'bg-yellow-500 text-black';
      case 'low':
        return 'bg-green-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'in_review':
        return 'bg-blue-500/20 text-blue-400';
      case 'escalated':
        return 'bg-red-500/20 text-red-400';
      case 'approved':
        return 'bg-green-500/20 text-green-400';
      case 'rejected':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Content Moderation Queue</h1>
            <p className="text-gray-400 mt-1">
              {queueData?.total || 0} items awaiting review
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="escalated">Escalated</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Risk Level</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Queue Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : queueData?.items.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No items in queue
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Video
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Risk
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Flags
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {queueData?.items.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-750 ${selectedItem?.id === item.id ? 'bg-gray-750' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <div className="text-sm font-mono truncate max-w-xs">
                        {item.videoUri.split('/').pop()}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">
                        by {item.authorDid.slice(0, 20)}...
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getRiskLevelColor(item.riskLevel)}`}
                      >
                        {item.riskLevel.toUpperCase()} ({item.riskScore})
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {item.flags.map((flag) => (
                          <span
                            key={flag}
                            className="px-2 py-0.5 bg-gray-700 rounded text-xs"
                          >
                            {flag}
                          </span>
                        ))}
                        {item.flags.length === 0 && (
                          <span className="text-gray-500 text-xs">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${getStatusColor(item.status)}`}
                      >
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      {new Date(item.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                        >
                          Review
                        </button>
                        {item.status === 'pending' && (
                          <button
                            onClick={() => assignMutation.mutate({ queueId: item.id })}
                            disabled={assignMutation.isPending}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                          >
                            Claim
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Review Modal */}
        {selectedItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Review Content</h2>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <CloseIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Content Info */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-sm text-gray-400">Video URI</label>
                  <p className="font-mono text-sm break-all">{selectedItem.videoUri}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-400">Author</label>
                  <p className="font-mono text-sm">{selectedItem.authorDid}</p>
                </div>
                <div className="flex gap-4">
                  <div>
                    <label className="text-sm text-gray-400">Risk Level</label>
                    <p>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${getRiskLevelColor(selectedItem.riskLevel)}`}
                      >
                        {selectedItem.riskLevel.toUpperCase()}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Risk Score</label>
                    <p className="text-lg font-bold">{selectedItem.riskScore}</p>
                  </div>
                </div>
                {selectedItem.flags.length > 0 && (
                  <div>
                    <label className="text-sm text-gray-400">Flags</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedItem.flags.map((flag) => (
                        <span
                          key={flag}
                          className="px-3 py-1 bg-red-500/20 text-red-400 rounded"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes Input */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Moderator Notes (optional)
                </label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                  rows={2}
                  placeholder="Add any notes about this decision..."
                />
              </div>

              {/* Reject Reason (shown when rejecting) */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-1">
                  Rejection Reason (required for rejection)
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Select a reason...</option>
                  <option value="inappropriate_content">Inappropriate Content</option>
                  <option value="violence">Violence</option>
                  <option value="hate_speech">Hate Speech</option>
                  <option value="spam">Spam</option>
                  <option value="copyright">Copyright Violation</option>
                  <option value="misinformation">Misinformation</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    approveMutation.mutate({
                      videoUri: selectedItem.videoUri,
                      notes: actionNotes || undefined,
                    })
                  }
                  disabled={approveMutation.isPending}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-medium disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={() => {
                    if (!rejectReason) {
                      toast.error('Please select a rejection reason');
                      return;
                    }
                    rejectMutation.mutate({
                      videoUri: selectedItem.videoUri,
                      reason: rejectReason,
                      notes: actionNotes || undefined,
                    });
                  }}
                  disabled={rejectMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-medium disabled:opacity-50"
                >
                  {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
                </button>
                <button
                  onClick={() => {
                    const reason = prompt('Enter escalation reason:');
                    if (reason) {
                      escalateMutation.mutate({
                        videoUri: selectedItem.videoUri,
                        reason,
                      });
                    }
                  }}
                  disabled={escalateMutation.isPending}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg font-medium disabled:opacity-50"
                >
                  Escalate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
