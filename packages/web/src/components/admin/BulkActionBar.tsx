'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BulkActionPreview } from '@/lib/api';
import toast from 'react-hot-toast';

interface BulkActionBarProps {
  selectedDids: string[];
  onClearSelection: () => void;
  onActionComplete?: () => void;
}

type ActionType = 'sanction' | 'resetPassword' | 'delete' | 'forceLogout' | 'verify' | 'unverify';
type SanctionType = 'warning' | 'mute' | 'suspend' | 'ban';

export function BulkActionBar({
  selectedDids,
  onClearSelection,
  onActionComplete,
}: BulkActionBarProps) {
  const [showModal, setShowModal] = useState(false);
  const [currentAction, setCurrentAction] = useState<ActionType | null>(null);
  const [sanctionType, setSanctionType] = useState<SanctionType>('warning');
  const [reason, setReason] = useState('');
  const [hardDelete, setHardDelete] = useState(false);
  const [preview, setPreview] = useState<BulkActionPreview | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<any>(null);

  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: (data: { action: ActionType; sanctionType?: SanctionType }) =>
      api.bulkActionPreview({
        userDids: selectedDids,
        action: data.action,
        sanctionType: data.sanctionType,
      }),
    onSuccess: (data) => {
      setPreview(data);
    },
    onError: () => {
      toast.error('Failed to preview action');
    },
  });

  const sanctionMutation = useMutation({
    mutationFn: () =>
      api.bulkSanctionUsers({
        userDids: selectedDids,
        sanctionType,
        reason,
      }),
    onSuccess: (data) => {
      setResults(data);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(`Applied ${sanctionType} to ${data.summary.succeeded} user(s)`);
      if (onActionComplete) onActionComplete();
    },
    onError: () => {
      toast.error('Failed to apply sanctions');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.bulkResetPasswords({ userDids: selectedDids }),
    onSuccess: (data) => {
      setResults(data);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(`Reset passwords for ${data.summary.succeeded} user(s)`);
      if (onActionComplete) onActionComplete();
    },
    onError: () => {
      toast.error('Failed to reset passwords');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.bulkDeleteUsers({
        userDids: selectedDids,
        reason,
        hardDelete,
      }),
    onSuccess: (data) => {
      setResults(data);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(`Deleted ${data.summary.succeeded} user(s)`);
      if (onActionComplete) onActionComplete();
    },
    onError: () => {
      toast.error('Failed to delete users');
    },
  });

  const forceLogoutMutation = useMutation({
    mutationFn: () => api.bulkForceLogout({ userDids: selectedDids }),
    onSuccess: (data) => {
      setResults(data);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(
        `Logged out ${data.summary.succeeded} user(s), ${data.summary.totalSessionsInvalidated} sessions invalidated`
      );
      if (onActionComplete) onActionComplete();
    },
    onError: () => {
      toast.error('Failed to force logout');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (verified: boolean) =>
      api.bulkVerifyUsers({
        userDids: selectedDids,
        verified,
        reason,
      }),
    onSuccess: (data, verified) => {
      setResults(data);
      setShowResults(true);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(
        `${verified ? 'Verified' : 'Unverified'} ${data.summary.succeeded} user(s)`
      );
      if (onActionComplete) onActionComplete();
    },
    onError: () => {
      toast.error('Failed to update verification status');
    },
  });

  const handleOpenModal = (action: ActionType) => {
    setCurrentAction(action);
    setShowModal(true);
    setPreview(null);
    setResults(null);
    setShowResults(false);
    setReason('');
    setHardDelete(false);

    // Load preview
    previewMutation.mutate({
      action,
      sanctionType: action === 'sanction' ? sanctionType : undefined,
    });
  };

  const handleExecute = () => {
    if (!currentAction) return;

    switch (currentAction) {
      case 'sanction':
        if (!reason.trim()) {
          toast.error('Please provide a reason');
          return;
        }
        sanctionMutation.mutate();
        break;
      case 'resetPassword':
        resetPasswordMutation.mutate();
        break;
      case 'delete':
        if (!reason.trim()) {
          toast.error('Please provide a reason');
          return;
        }
        deleteMutation.mutate();
        break;
      case 'forceLogout':
        forceLogoutMutation.mutate();
        break;
      case 'verify':
        verifyMutation.mutate(true);
        break;
      case 'unverify':
        verifyMutation.mutate(false);
        break;
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setCurrentAction(null);
    setPreview(null);
    setResults(null);
    setShowResults(false);
    if (showResults) {
      onClearSelection();
    }
  };

  const isLoading =
    previewMutation.isPending ||
    sanctionMutation.isPending ||
    resetPasswordMutation.isPending ||
    deleteMutation.isPending ||
    forceLogoutMutation.isPending ||
    verifyMutation.isPending;

  if (selectedDids.length === 0) return null;

  return (
    <>
      {/* Floating Action Bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-surface border border-border rounded-xl shadow-lg px-4 py-3 flex items-center gap-4">
          <span className="text-text-primary font-medium">
            {selectedDids.length} user{selectedDids.length !== 1 ? 's' : ''} selected
          </span>

          <div className="h-6 w-px bg-border" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenModal('verify')}
              className="px-3 py-1.5 text-sm bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg transition-colors"
            >
              Verify
            </button>
            <button
              onClick={() => handleOpenModal('unverify')}
              className="px-3 py-1.5 text-sm bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 rounded-lg transition-colors"
            >
              Unverify
            </button>
            <button
              onClick={() => handleOpenModal('sanction')}
              className="px-3 py-1.5 text-sm bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 rounded-lg transition-colors"
            >
              Sanction
            </button>
            <button
              onClick={() => handleOpenModal('resetPassword')}
              className="px-3 py-1.5 text-sm bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition-colors"
            >
              Reset Password
            </button>
            <button
              onClick={() => handleOpenModal('forceLogout')}
              className="px-3 py-1.5 text-sm bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 rounded-lg transition-colors"
            >
              Force Logout
            </button>
            <button
              onClick={() => handleOpenModal('delete')}
              className="px-3 py-1.5 text-sm bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>

          <div className="h-6 w-px bg-border" />

          <button
            onClick={onClearSelection}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />
          <div className="relative bg-surface border border-border rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">
                {showResults ? 'Action Results' : `Bulk ${getActionLabel(currentAction!)}`}
              </h2>
              <p className="text-sm text-text-muted mt-1">
                {showResults
                  ? `Completed action on ${results?.summary?.total || 0} users`
                  : `This action will affect ${selectedDids.length} user(s)`}
              </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {showResults ? (
                <ResultsView results={results} action={currentAction!} />
              ) : (
                <>
                  {/* Action-specific options */}
                  {currentAction === 'sanction' && (
                    <div className="space-y-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          Sanction Type
                        </label>
                        <select
                          value={sanctionType}
                          onChange={(e) => {
                            setSanctionType(e.target.value as SanctionType);
                            previewMutation.mutate({
                              action: 'sanction',
                              sanctionType: e.target.value as SanctionType,
                            });
                          }}
                          className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                        >
                          <option value="warning">Warning</option>
                          <option value="mute">Mute</option>
                          <option value="suspend">Suspend</option>
                          <option value="ban">Ban</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          Reason
                        </label>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Enter reason for sanction..."
                          className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted resize-none h-24"
                        />
                      </div>
                    </div>
                  )}

                  {currentAction === 'delete' && (
                    <div className="space-y-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-text-primary mb-2">
                          Reason for deletion
                        </label>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Enter reason for deletion..."
                          className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted resize-none h-24"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="hardDelete"
                          checked={hardDelete}
                          onChange={(e) => setHardDelete(e.target.checked)}
                          className="w-4 h-4 rounded border-border"
                        />
                        <label htmlFor="hardDelete" className="text-sm text-text-primary">
                          Hard delete (permanently remove all user data)
                        </label>
                      </div>
                      {hardDelete && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <p className="text-sm text-red-500">
                            Warning: Hard delete is irreversible. All user data including
                            videos, comments, and account information will be permanently
                            removed.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview Section */}
                  {preview && (
                    <div className="space-y-4">
                      {/* Warnings */}
                      {preview.warnings.length > 0 && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                          <p className="text-sm font-medium text-yellow-500 mb-2">
                            Warnings
                          </p>
                          <ul className="list-disc list-inside text-sm text-yellow-500/80 space-y-1">
                            {preview.warnings.map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Affected Users Preview */}
                      <div>
                        <p className="text-sm font-medium text-text-primary mb-2">
                          Affected Users ({preview.preview.affectedCount})
                        </p>
                        <div className="max-h-48 overflow-y-auto border border-border rounded-lg">
                          {preview.preview.users.map((user) => (
                            <div
                              key={user.did}
                              className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0"
                            >
                              <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                                {user.avatar ? (
                                  <img
                                    src={user.avatar}
                                    alt={user.handle}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                                    {user.handle[0]?.toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {user.displayName || user.handle}
                                </p>
                                <p className="text-xs text-text-muted">@{user.handle}</p>
                              </div>
                              {user.currentSanction && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">
                                  {user.currentSanction}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Not Found Users */}
                      {preview.preview.notFoundCount > 0 && (
                        <div className="text-sm text-text-muted">
                          {preview.preview.notFoundCount} user(s) not found and will be
                          skipped
                        </div>
                      )}
                    </div>
                  )}

                  {previewMutation.isPending && (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                {showResults ? 'Done' : 'Cancel'}
              </button>
              {!showResults && (
                <button
                  onClick={handleExecute}
                  disabled={isLoading || !preview?.canProceed}
                  className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                    currentAction === 'delete'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-accent hover:bg-accent-hover text-text-inverse'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isLoading ? 'Processing...' : `${getActionLabel(currentAction!)} ${selectedDids.length} Users`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getActionLabel(action: ActionType): string {
  switch (action) {
    case 'sanction':
      return 'Sanction';
    case 'resetPassword':
      return 'Reset Password';
    case 'delete':
      return 'Delete';
    case 'forceLogout':
      return 'Force Logout';
    case 'verify':
      return 'Verify';
    case 'unverify':
      return 'Unverify';
  }
}

function ResultsView({ results, action }: { results: any; action: ActionType }) {
  if (!results) return null;

  const { summary, results: items } = results;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-surface-hover rounded-lg text-center">
          <p className="text-2xl font-bold text-text-primary">{summary.total}</p>
          <p className="text-sm text-text-muted">Total</p>
        </div>
        <div className="p-4 bg-green-500/10 rounded-lg text-center">
          <p className="text-2xl font-bold text-green-500">{summary.succeeded}</p>
          <p className="text-sm text-green-500/80">Succeeded</p>
        </div>
        <div className="p-4 bg-red-500/10 rounded-lg text-center">
          <p className="text-2xl font-bold text-red-500">{summary.failed}</p>
          <p className="text-sm text-red-500/80">Failed</p>
        </div>
      </div>

      {/* Detailed Results */}
      {items && items.length > 0 && (
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Details</p>
          <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
            {items.map((item: any) => (
              <div
                key={item.did}
                className="flex items-center justify-between px-4 py-2 border-b border-border last:border-0"
              >
                <span className="text-sm text-text-primary font-mono truncate max-w-[200px]">
                  {item.did}
                </span>
                {item.success ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
                    Success
                    {action === 'resetPassword' && item.temporaryPassword && (
                      <span className="ml-2 font-mono">{item.temporaryPassword}</span>
                    )}
                    {action === 'forceLogout' && (
                      <span className="ml-2">({item.sessionsInvalidated} sessions)</span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                    {item.error || 'Failed'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
