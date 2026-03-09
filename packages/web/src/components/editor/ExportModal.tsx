'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRenderProgress, type RenderProgress, type RenderJobUpdate } from '@/hooks/useRenderProgress';
import toast from 'react-hot-toast';

interface ExportModalProps {
  projectId: string;
  projectName: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  onClose: () => void;
}

type ExportQuality = 'draft' | 'medium' | 'high' | 'ultra';
type ExportFormat = 'mp4' | 'webm' | 'mov';

const QUALITY_OPTIONS: { value: ExportQuality; label: string; description: string }[] = [
  { value: 'draft', label: 'Draft', description: 'Quick preview, lower quality' },
  { value: 'medium', label: 'Medium', description: 'Good quality, faster export' },
  { value: 'high', label: 'High', description: 'Best quality for sharing' },
  { value: 'ultra', label: 'Ultra', description: 'Maximum quality, slower export' },
];

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'mp4', label: 'MP4 (H.264)', description: 'Best compatibility' },
  { value: 'webm', label: 'WebM (VP9)', description: 'Web optimized' },
  { value: 'mov', label: 'MOV (ProRes)', description: 'Professional editing' },
];

export function ExportModal({
  projectId,
  projectName,
  width,
  height,
  fps,
  duration,
  onClose,
}: ExportModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<'settings' | 'rendering' | 'complete' | 'error'>('settings');
  const [quality, setQuality] = useState<ExportQuality>('high');
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Subscribe to render progress
  const { progress, isConnected } = useRenderProgress(jobId, {
    onProgress: useCallback((p: RenderProgress) => {
      console.log('Render progress:', p);
    }, []),
    onComplete: useCallback((update: RenderJobUpdate) => {
      console.log('Render complete:', update);
      setOutputUrl(update.outputUrl || null);
      setStep('complete');
      toast.success('Export complete!');
    }, []),
    onFailed: useCallback((update: RenderJobUpdate) => {
      console.log('Render failed:', update);
      setErrorMessage(update.error || 'Export failed');
      setStep('error');
      toast.error('Export failed');
    }, []),
    enabled: !!jobId,
  });

  const handleStartExport = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await api.createStudioRenderJob({
        projectId,
        format,
        quality,
        resolution: { width, height },
        frameRate: fps,
        priority: 'normal',
      });

      setJobId(result.jobId);
      setStep('rendering');
      toast.success('Export started');
    } catch (error) {
      console.error('Failed to start export:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start export');
      setStep('error');
      toast.error('Failed to start export');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (jobId && step === 'rendering') {
      try {
        await api.cancelStudioRenderJob(jobId);
        toast.success('Export cancelled');
      } catch (error) {
        console.error('Failed to cancel:', error);
      }
    }
    onClose();
  };

  const handleRetry = async () => {
    if (jobId) {
      try {
        const result = await api.retryStudioRenderJob(jobId);
        setJobId(result.jobId);
        setStep('rendering');
        setErrorMessage(null);
        toast.success('Retrying export');
      } catch (error) {
        console.error('Failed to retry:', error);
        toast.error('Failed to retry export');
      }
    }
  };

  const handleDownload = () => {
    if (outputUrl) {
      window.open(outputUrl, '_blank');
    }
  };

  const handlePublish = () => {
    if (jobId) {
      router.push(`/upload?renderJobId=${jobId}`);
      onClose();
    }
  };

  const getProgressPercent = () => {
    if (!progress) return 0;
    return Math.min(100, Math.max(0, progress.progress));
  };

  const getProgressLabel = () => {
    if (!progress) return 'Preparing...';

    switch (progress.status) {
      case 'pending':
        return 'Waiting in queue...';
      case 'queued':
        return 'Starting render...';
      case 'rendering':
        return progress.currentStep || `Rendering... ${progress.progress}%`;
      case 'encoding':
        return 'Encoding video...';
      case 'uploading':
        return 'Uploading...';
      case 'completed':
        return 'Complete!';
      case 'failed':
        return 'Failed';
      case 'paused':
        return 'Paused';
      default:
        return 'Processing...';
    }
  };

  const estimatedTime = () => {
    // Rough estimate based on duration and quality
    const baseFactor = duration / fps; // seconds of video
    const qualityMultiplier = { draft: 0.5, medium: 1, high: 2, ultra: 4 };
    const seconds = Math.ceil(baseFactor * qualityMultiplier[quality] * 2);

    if (seconds < 60) return `~${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {step === 'settings' && 'Export Video'}
            {step === 'rendering' && 'Exporting...'}
            {step === 'complete' && 'Export Complete'}
            {step === 'error' && 'Export Failed'}
          </h2>
          <button
            onClick={handleCancel}
            className="p-1 rounded hover:bg-surface transition-colors"
          >
            <CloseIcon className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'settings' && (
            <div className="space-y-6">
              {/* Project Info */}
              <div className="bg-surface rounded-lg p-4">
                <p className="text-sm text-text-muted mb-1">Project</p>
                <p className="font-medium text-text-primary">{projectName}</p>
                <div className="flex gap-4 mt-2 text-xs text-text-muted">
                  <span>{width}x{height}</span>
                  <span>{fps} fps</span>
                  <span>{Math.round(duration / fps)}s</span>
                </div>
              </div>

              {/* Quality Selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Quality</label>
                <div className="grid grid-cols-2 gap-2">
                  {QUALITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setQuality(option.value)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        quality === option.value
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <p className="font-medium text-text-primary text-sm">{option.label}</p>
                      <p className="text-xs text-text-muted mt-0.5">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Format</label>
                <div className="space-y-2">
                  {FORMAT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormat(option.value)}
                      className={`w-full p-3 rounded-lg border flex items-center justify-between transition-colors ${
                        format === option.value
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-text-primary text-sm">{option.label}</p>
                        <p className="text-xs text-text-muted">{option.description}</p>
                      </div>
                      {format === option.value && (
                        <CheckIcon className="w-5 h-5 text-accent" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated Time */}
              <div className="text-center text-sm text-text-muted">
                Estimated export time: {estimatedTime()}
              </div>
            </div>
          )}

          {step === 'rendering' && (
            <div className="space-y-6">
              {/* Progress Circle */}
              <div className="flex justify-center">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-surface"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - getProgressPercent() / 100)}`}
                      className="text-accent transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-text-primary">
                      {Math.round(getProgressPercent())}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Label */}
              <div className="text-center">
                <p className="font-medium text-text-primary">{getProgressLabel()}</p>
                {progress?.eta && progress.eta > 0 && (
                  <p className="text-sm text-text-muted mt-1">
                    ~{Math.ceil(progress.eta / 60)} min remaining
                  </p>
                )}
                {!isConnected && (
                  <p className="text-xs text-yellow-500 mt-2">
                    Reconnecting to server...
                  </p>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${getProgressPercent()}%` }}
                />
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckIcon className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-text-primary">Your video is ready!</p>
                <p className="text-sm text-text-muted mt-1">
                  Download it or publish directly to your profile.
                </p>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                <ErrorIcon className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <p className="font-medium text-text-primary">Export Failed</p>
                <p className="text-sm text-text-muted mt-1">
                  {errorMessage || 'An error occurred during export.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          {step === 'settings' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartExport}
                disabled={isSubmitting}
                className="px-6 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Starting...' : 'Start Export'}
              </button>
            </>
          )}

          {step === 'rendering' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              Cancel Export
            </button>
          )}

          {step === 'complete' && (
            <>
              <button
                onClick={handleDownload}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface transition-colors"
              >
                Download
              </button>
              <button
                onClick={handlePublish}
                className="px-6 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Publish
              </button>
            </>
          )}

          {step === 'error' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleRetry}
                className="px-6 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Icons
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

export default ExportModal;
