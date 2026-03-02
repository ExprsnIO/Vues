'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AppealModalProps {
  sanctionId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const MIN_REASON_LENGTH = 50;
const MAX_REASON_LENGTH = 2000;

export function AppealModal({ sanctionId, onClose, onSuccess }: AppealModalProps) {
  const [reason, setReason] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const submitAppealMutation = useMutation({
    mutationFn: () =>
      api.submitUserAppeal({
        sanctionId,
        reason,
        additionalInfo: additionalInfo || undefined,
      }),
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to submit appeal. Please try again.');
    },
  });

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (reason.trim().length < MIN_REASON_LENGTH) {
      setError(`Please provide at least ${MIN_REASON_LENGTH} characters explaining your appeal.`);
      return;
    }

    submitAppealMutation.mutate();
  };

  const charCount = reason.length;
  const isValidLength = charCount >= MIN_REASON_LENGTH;
  const isOverLimit = charCount > MAX_REASON_LENGTH;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={modalRef}
        className="w-full max-w-lg bg-background rounded-xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-labelledby="appeal-modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="appeal-modal-title" className="text-lg font-semibold text-text-primary">
            Submit Appeal
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-surface rounded-lg p-3 text-sm text-text-secondary">
            <p>
              Please explain why you believe this action was taken in error. Provide specific
              details and context that may help us review your case.
            </p>
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="appeal-reason"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Reason for Appeal <span className="text-error">*</span>
            </label>
            <textarea
              id="appeal-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you believe this action should be reversed..."
              className={cn(
                'w-full h-32 px-3 py-2 bg-surface border rounded-lg resize-none',
                'text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent/50',
                isOverLimit ? 'border-error' : 'border-border'
              )}
              required
            />
            <div className="mt-1 flex justify-between text-xs">
              <span
                className={cn(
                  !isValidLength && charCount > 0 ? 'text-error' : 'text-text-muted'
                )}
              >
                Minimum {MIN_REASON_LENGTH} characters
              </span>
              <span
                className={cn(
                  isOverLimit ? 'text-error' : 'text-text-muted'
                )}
              >
                {charCount}/{MAX_REASON_LENGTH}
              </span>
            </div>
          </div>

          {/* Additional Info */}
          <div>
            <label
              htmlFor="appeal-additional"
              className="block text-sm font-medium text-text-primary mb-1.5"
            >
              Additional Information (optional)
            </label>
            <textarea
              id="appeal-additional"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="Any additional context, links, or evidence..."
              className={cn(
                'w-full h-20 px-3 py-2 bg-surface border border-border rounded-lg resize-none',
                'text-text-primary placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent/50'
              )}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
              disabled={submitAppealMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValidLength || isOverLimit || submitAppealMutation.isPending}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                'bg-accent text-text-inverse hover:bg-accent-hover',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {submitAppealMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  Submitting...
                </span>
              ) : (
                'Submit Appeal'
              )}
            </button>
          </div>
        </form>

        {/* Success State */}
        {submitAppealMutation.isSuccess && (
          <div className="absolute inset-0 bg-background flex flex-col items-center justify-center p-6 text-center">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Appeal Submitted
            </h3>
            <p className="text-text-secondary mb-6">
              Your appeal has been submitted and will be reviewed by our team.
              You'll be notified of the decision.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-accent text-text-inverse rounded-lg font-medium hover:bg-accent-hover transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
