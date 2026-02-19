'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export type ReportContentType = 'video' | 'comment' | 'loop' | 'collab' | 'user';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'nudity'
  | 'misinformation'
  | 'copyright'
  | 'self_harm'
  | 'other';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: ReportContentType;
  contentUri: string;
  contentCid?: string;
  contentPreview?: {
    text?: string;
    thumbnail?: string;
    authorHandle?: string;
  };
}

const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  {
    value: 'spam',
    label: 'Spam',
    description: 'Repetitive, misleading, or unwanted content',
  },
  {
    value: 'harassment',
    label: 'Harassment or Bullying',
    description: 'Content targeting individuals with hostility or abuse',
  },
  {
    value: 'hate_speech',
    label: 'Hate Speech',
    description: 'Content promoting hatred against protected groups',
  },
  {
    value: 'violence',
    label: 'Violence or Threats',
    description: 'Content depicting or threatening violence',
  },
  {
    value: 'nudity',
    label: 'Nudity or Sexual Content',
    description: 'Explicit or inappropriate sexual content',
  },
  {
    value: 'misinformation',
    label: 'Misinformation',
    description: 'False or misleading information',
  },
  {
    value: 'copyright',
    label: 'Copyright Violation',
    description: 'Content that infringes on intellectual property rights',
  },
  {
    value: 'self_harm',
    label: 'Self-Harm or Suicide',
    description: 'Content promoting or depicting self-harm',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other violation not listed above',
  },
];

export function ReportModal({
  isOpen,
  onClose,
  contentType,
  contentUri,
  contentCid,
  contentPreview,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<'reason' | 'details' | 'success'>('reason');

  const reportMutation = useMutation({
    mutationFn: () =>
      api.report({
        subjectUri: contentUri,
        subjectCid: contentCid || '',
        reason: selectedReason!,
        description: description || undefined,
      }),
    onSuccess: () => {
      setStep('success');
    },
    onError: () => {
      toast.error('Failed to submit report. Please try again.');
    },
  });

  const handleClose = () => {
    setSelectedReason(null);
    setDescription('');
    setStep('reason');
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedReason) return;
    reportMutation.mutate();
  };

  const getContentTypeLabel = () => {
    switch (contentType) {
      case 'video':
        return 'video';
      case 'comment':
        return 'comment';
      case 'loop':
        return 'loop';
      case 'collab':
        return 'collab';
      case 'user':
        return 'user';
      default:
        return 'content';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">
            {step === 'success' ? 'Report Submitted' : `Report ${getContentTypeLabel()}`}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'reason' && (
            <div className="p-4 space-y-4">
              {/* Content Preview */}
              {contentPreview && (
                <div className="p-3 bg-surface rounded-lg">
                  <div className="flex items-start gap-3">
                    {contentPreview.thumbnail && (
                      <img
                        src={contentPreview.thumbnail}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {contentPreview.text && (
                        <p className="text-sm text-text-primary line-clamp-2">{contentPreview.text}</p>
                      )}
                      {contentPreview.authorHandle && (
                        <p className="text-xs text-text-muted mt-1">@{contentPreview.authorHandle}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-sm text-text-muted">
                Why are you reporting this {getContentTypeLabel()}?
              </p>

              {/* Reason Selection */}
              <div className="space-y-2">
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    onClick={() => setSelectedReason(reason.value)}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      selectedReason === reason.value
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:border-accent/50 hover:bg-surface'
                    }`}
                  >
                    <p className="font-medium text-text-primary">{reason.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{reason.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="p-4 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 text-xs font-medium bg-accent/10 text-accent rounded-full">
                    {REPORT_REASONS.find((r) => r.value === selectedReason)?.label}
                  </span>
                </div>
                <p className="text-sm text-text-muted">
                  Please provide additional details to help our moderators review this report.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">
                  Additional details (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide any additional context that might help us understand this report..."
                  rows={4}
                  maxLength={500}
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
                <p className="text-xs text-text-muted mt-1 text-right">{description.length}/500</p>
              </div>

              <div className="p-3 bg-surface rounded-lg">
                <p className="text-xs text-text-muted">
                  <strong className="text-text-secondary">Note:</strong> False reports may result in
                  action against your account. Please only report genuine violations of our community
                  guidelines.
                </p>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckIcon className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Thank you for reporting</h3>
              <p className="text-sm text-text-muted">
                Our moderation team will review this {getContentTypeLabel()} and take appropriate action
                if it violates our community guidelines.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'success' && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            {step === 'details' ? (
              <>
                <button
                  onClick={() => setStep('reason')}
                  className="px-4 py-2 text-text-primary hover:bg-surface rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={reportMutation.isPending}
                  className="px-6 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {reportMutation.isPending ? 'Submitting...' : 'Submit Report'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-text-primary hover:bg-surface rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('details')}
                  disabled={!selectedReason}
                  className="px-6 py-2 bg-accent text-text-inverse font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
              </>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="p-4 border-t border-border">
            <button
              onClick={handleClose}
              className="w-full px-6 py-2 bg-accent text-text-inverse font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Icons
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
