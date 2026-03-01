'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Appeal, UserAction, AdminTeamMember } from '@/lib/api';
import toast from 'react-hot-toast';

type AppealStatus = 'pending' | 'reviewing' | 'approved' | 'denied' | '';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  reviewing: 'In Review',
  approved: 'Approved',
  denied: 'Denied',
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  warn: 'Warning',
  mute: 'Mute',
  restrict: 'Restriction',
  suspend: 'Suspension',
  ban: 'Ban',
};

export default function AppealsPage() {
  const [statusFilter, setStatusFilter] = useState<AppealStatus>('pending');
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [selectedUserAction, setSelectedUserAction] = useState<UserAction | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'denied'>('approved');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const queryClient = useQueryClient();

  // Fetch appeals
  const { data: appealsData, isLoading } = useQuery({
    queryKey: ['appeals', statusFilter],
    queryFn: () => api.listAppeals({ status: statusFilter || undefined, limit: 50 }),
  });

  // Fetch admin team for assignment
  const { data: teamData } = useQuery({
    queryKey: ['admin-team'],
    queryFn: () => api.getAdminTeam(),
  });

  // Review appeal mutation
  const reviewMutation = useMutation({
    mutationFn: (data: { appealId: string; decision: 'approved' | 'denied'; reviewNotes?: string }) =>
      api.reviewAppeal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      setShowReviewModal(false);
      setSelectedAppeal(null);
      setReviewNotes('');
      toast.success(`Appeal ${reviewDecision === 'approved' ? 'approved' : 'denied'}`);
    },
    onError: () => {
      toast.error('Failed to review appeal');
    },
  });

  // Assign appeal mutation
  const assignMutation = useMutation({
    mutationFn: (data: { appealId: string; assigneeId: string }) =>
      api.assignAppeal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appeals'] });
      setShowAssignModal(false);
      toast.success('Appeal assigned');
    },
    onError: () => {
      toast.error('Failed to assign appeal');
    },
  });

  const appeals = appealsData?.appeals || [];
  const total = appealsData?.total || 0;
  const admins = teamData?.admins || [];

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      reviewing: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      denied: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const handleViewAppeal = async (appeal: Appeal) => {
    setSelectedAppeal(appeal);
    if (appeal.userActionId) {
      try {
        const { userAction } = await api.getAppeal(appeal.id);
        setSelectedUserAction(userAction || null);
      } catch {
        setSelectedUserAction(null);
      }
    } else {
      setSelectedUserAction(null);
    }
  };

  const handleReview = (decision: 'approved' | 'denied') => {
    setReviewDecision(decision);
    setShowReviewModal(true);
  };

  const submitReview = () => {
    if (!selectedAppeal) return;
    reviewMutation.mutate({
      appealId: selectedAppeal.id,
      decision: reviewDecision,
      reviewNotes: reviewNotes || undefined,
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Appeals</h1>
        <p className="text-gray-600 mt-1">Review user appeals for moderation decisions</p>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {['', 'pending', 'reviewing', 'approved', 'denied'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status as AppealStatus)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              statusFilter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status === '' ? 'All' : STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appeals List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold">
              Appeals ({total})
            </h2>
          </div>
          <div className="divide-y max-h-[600px] overflow-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : appeals.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No appeals found</div>
            ) : (
              appeals.map((appeal) => (
                <div
                  key={appeal.id}
                  onClick={() => handleViewAppeal(appeal)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedAppeal?.id === appeal.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(appeal.status)}`}>
                          {STATUS_LABELS[appeal.status]}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(appeal.submittedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-900 font-medium truncate">
                        User: {appeal.userId.slice(0, 20)}...
                      </p>
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                        {appeal.reason}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Appeal Detail */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Appeal Details</h2>
          </div>
          {selectedAppeal ? (
            <div className="p-4">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Status</label>
                  <p className="mt-1">
                    <span className={`px-2 py-0.5 rounded text-sm font-medium ${getStatusBadge(selectedAppeal.status)}`}>
                      {STATUS_LABELS[selectedAppeal.status]}
                    </span>
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">User</label>
                  <p className="mt-1 font-mono text-sm">{selectedAppeal.userId}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Appeal Reason</label>
                  <p className="mt-1 text-sm bg-gray-50 p-3 rounded">{selectedAppeal.reason}</p>
                </div>

                {selectedAppeal.additionalInfo && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase">Additional Info</label>
                    <p className="mt-1 text-sm bg-gray-50 p-3 rounded">{selectedAppeal.additionalInfo}</p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Submitted</label>
                  <p className="mt-1 text-sm">{new Date(selectedAppeal.submittedAt).toLocaleString()}</p>
                </div>

                {/* Original Sanction Details */}
                {selectedUserAction && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Original Sanction</h3>
                    <div className="bg-red-50 p-3 rounded space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Type:</span>
                        <span className="text-sm font-medium">
                          {ACTION_TYPE_LABELS[selectedUserAction.actionType] || selectedUserAction.actionType}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Reason:</span>
                        <span className="text-sm">{selectedUserAction.reason}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Active:</span>
                        <span className={`text-sm font-medium ${selectedUserAction.active ? 'text-red-600' : 'text-green-600'}`}>
                          {selectedUserAction.active ? 'Yes' : 'No (Reversed)'}
                        </span>
                      </div>
                      {selectedUserAction.expiresAt && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Expires:</span>
                          <span className="text-sm">{new Date(selectedUserAction.expiresAt).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Issued:</span>
                        <span className="text-sm">{new Date(selectedUserAction.performedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Review Notes (if already reviewed) */}
                {selectedAppeal.reviewNotes && (
                  <div className="border-t pt-4">
                    <label className="text-xs font-medium text-gray-500 uppercase">Review Notes</label>
                    <p className="mt-1 text-sm bg-gray-50 p-3 rounded">{selectedAppeal.reviewNotes}</p>
                    {selectedAppeal.reviewedAt && (
                      <p className="mt-1 text-xs text-gray-500">
                        Reviewed on {new Date(selectedAppeal.reviewedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                {selectedAppeal.status === 'pending' || selectedAppeal.status === 'reviewing' ? (
                  <div className="border-t pt-4 flex gap-3">
                    <button
                      onClick={() => handleReview('approved')}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReview('denied')}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                    >
                      Deny
                    </button>
                    {selectedAppeal.status === 'pending' && (
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              Select an appeal to view details
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {showReviewModal && selectedAppeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-4 border-b">
              <h3 className="font-semibold">
                {reviewDecision === 'approved' ? 'Approve Appeal' : 'Deny Appeal'}
              </h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                {reviewDecision === 'approved'
                  ? 'Approving this appeal will reverse the original sanction.'
                  : 'Denying this appeal will keep the original sanction in place.'}
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Review Notes (optional)
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full border rounded-lg p-2 h-24 resize-none"
                placeholder="Add notes about your decision..."
              />
            </div>
            <div className="p-4 border-t flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setReviewNotes('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={reviewMutation.isPending}
                className={`px-4 py-2 text-white rounded-lg font-medium transition-colors ${
                  reviewDecision === 'approved'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50`}
              >
                {reviewMutation.isPending ? 'Processing...' : `Confirm ${reviewDecision === 'approved' ? 'Approval' : 'Denial'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedAppeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Assign Appeal</h3>
            </div>
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                Select a moderator to review this appeal.
              </p>
              <div className="space-y-2 max-h-60 overflow-auto">
                {admins.map((admin: AdminTeamMember) => (
                  <button
                    key={admin.id}
                    onClick={() => {
                      assignMutation.mutate({
                        appealId: selectedAppeal.id,
                        assigneeId: admin.userDid,
                      });
                    }}
                    className="w-full p-3 text-left border rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
                      {admin.user?.displayName?.[0] || admin.user?.handle?.[0] || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {admin.user?.displayName || admin.user?.handle}
                      </p>
                      <p className="text-xs text-gray-500">{admin.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
