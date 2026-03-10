'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Modal, ModalBody, ModalFooter } from '@/components/admin/ui/Modal';
import toast from 'react-hot-toast';

interface SuspendUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    did: string;
    handle: string;
    displayName?: string;
  };
  domainId?: string;
}

const DURATION_OPTIONS = [
  { label: '1 Day', value: 1 },
  { label: '3 Days', value: 3 },
  { label: '7 Days', value: 7 },
  { label: '14 Days', value: 14 },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 },
  { label: 'Permanent', value: 0 },
];

export function SuspendUserModal({
  isOpen,
  onClose,
  user,
  domainId,
}: SuspendUserModalProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<number>(7);
  const [note, setNote] = useState('');

  const suspendMutation = useMutation({
    mutationFn: () => {
      if (domainId) {
        return api.adminDomainUsersSuspend({
          domainId,
          userDid: user.did,
          reason,
          duration: duration > 0 ? duration : undefined,
          note: note || undefined,
        });
      }
      return api.adminUsersSuspend({
        userDid: user.did,
        reason,
        duration: duration > 0 ? duration : undefined,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      toast.success('User suspended successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains', domainId, 'users'] });
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to suspend user');
    },
  });

  const handleClose = () => {
    setReason('');
    setDuration(7);
    setNote('');
    onClose();
  };

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    suspendMutation.mutate();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Suspend User"
      description={`Suspend ${user.displayName || user.handle} (@${user.handle})`}
      size="md"
    >
      <ModalBody>
        <div className="space-y-4">
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
              <option value="spam">Spam or commercial content</option>
              <option value="harassment">Harassment or bullying</option>
              <option value="hate_speech">Hate speech or discrimination</option>
              <option value="violence">Violence or threats</option>
              <option value="misinformation">Misinformation</option>
              <option value="impersonation">Impersonation</option>
              <option value="copyright">Copyright violation</option>
              <option value="terms_violation">Terms of service violation</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Duration
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDuration(option.value)}
                  className={`
                    px-4 py-2 text-sm rounded-lg border transition-colors
                    ${
                      duration === option.value
                        ? 'bg-accent text-text-inverse border-accent'
                        : 'bg-surface text-text-secondary border-border hover:bg-surface-hover'
                    }
                  `}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              {duration === 0
                ? 'User will be suspended indefinitely until manually unsuspended'
                : `User will be automatically unsuspended after ${duration} day${duration === 1 ? '' : 's'}`}
            </p>
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
          disabled={!reason.trim() || suspendMutation.isPending}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {suspendMutation.isPending ? 'Suspending...' : 'Suspend User'}
        </button>
      </ModalFooter>
    </Modal>
  );
}
