'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Modal, ModalBody, ModalFooter } from '@/components/admin/ui/Modal';
import toast from 'react-hot-toast';

interface BanUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    did: string;
    handle: string;
    displayName?: string;
  };
  domainId?: string;
}

export function BanUserModal({
  isOpen,
  onClose,
  user,
  domainId,
}: BanUserModalProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const banMutation = useMutation({
    mutationFn: () => {
      if (domainId) {
        return api.adminDomainUsersBan({
          domainId,
          userDid: user.did,
          reason,
          note: note || undefined,
        });
      }
      return api.adminUsersBan({
        userDid: user.did,
        reason,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      toast.success('User banned successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains', domainId, 'users'] });
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to ban user');
    },
  });

  const handleClose = () => {
    setReason('');
    setNote('');
    setConfirmed(false);
    onClose();
  };

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (!confirmed) {
      toast.error('Please confirm the ban');
      return;
    }
    banMutation.mutate();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Ban User"
      description={`Permanently ban ${user.displayName || user.handle} (@${user.handle})`}
      size="md"
    >
      <ModalBody>
        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex gap-3">
              <svg
                className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-500">Warning: Permanent Ban</p>
                <p className="text-xs text-text-muted mt-1">
                  This will permanently ban the user from the platform. They will not be able to
                  create content, interact with others, or access their account. This action can
                  only be reversed manually by an administrator.
                </p>
              </div>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Select a reason...</option>
              <option value="severe_spam">Severe or repeated spam</option>
              <option value="harassment">Severe harassment or bullying</option>
              <option value="hate_speech">Hate speech or severe discrimination</option>
              <option value="violence">Violence, threats, or dangerous content</option>
              <option value="illegal_content">Illegal content</option>
              <option value="csam">Child safety violation</option>
              <option value="doxxing">Doxxing or sharing private information</option>
              <option value="ban_evasion">Ban evasion</option>
              <option value="repeat_offender">Repeat offender</option>
              <option value="other">Other severe violation</option>
            </select>
          </div>

          {/* Internal Note (Optional) */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Internal Note (Optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add any additional context for other moderators..."
              rows={3}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
            <p className="mt-1 text-xs text-text-muted">
              This note is only visible to administrators
            </p>
          </div>

          {/* Confirmation */}
          <div className="pt-4 border-t border-border">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-accent bg-surface border-border rounded focus:ring-2 focus:ring-accent"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">
                  I confirm this permanent ban
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  I understand this is a severe action and have reviewed the user's history
                </p>
              </div>
            </label>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!reason.trim() || !confirmed || banMutation.isPending}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {banMutation.isPending ? 'Banning...' : 'Ban User Permanently'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
