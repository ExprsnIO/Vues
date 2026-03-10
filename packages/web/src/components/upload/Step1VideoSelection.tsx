'use client';

import { useCallback, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPTED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

interface Step1VideoSelectionProps {
  file: File | null;
  previewUrl: string | null;
  onFileSelect: (file: File, previewUrl: string) => void;
  onNext: () => void;
  onLoadDraft: () => void;
  hasDrafts: boolean;
}

export function Step1VideoSelection({
  file,
  previewUrl,
  onFileSelect,
  onNext,
  onLoadDraft,
  hasDrafts,
}: Step1VideoSelectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndSetFile = useCallback(
    (selectedFile: File) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
        setError('Please select a valid video file (MP4, WebM, or MOV)');
        return;
      }

      if (selectedFile.size > MAX_FILE_SIZE) {
        setError('File size must be less than 100MB');
        return;
      }

      const previewUrl = URL.createObjectURL(selectedFile);
      onFileSelect(selectedFile, previewUrl);
    },
    [onFileSelect]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        validateAndSetFile(selectedFile);
      }
    },
    [validateAndSetFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        validateAndSetFile(droppedFile);
      }
    },
    [validateAndSetFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleRemoveFile = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onFileSelect(null as any, null as any);
    setError(null);
  }, [previewUrl, onFileSelect]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Upload your video</h2>
        <p className="text-gray-400">Select a video file to get started</p>
      </div>

      {/* Drafts notification */}
      {hasDrafts && !file && (
        <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700/50 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DraftIcon className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-blue-200">
                You have saved drafts
              </p>
              <p className="text-xs text-blue-300">
                Continue where you left off
              </p>
            </div>
          </div>
          <button
            onClick={onLoadDraft}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View Drafts
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Upload Zone */}
        <div>
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={twMerge(
                'aspect-[9/16] bg-zinc-900 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all',
                dragActive
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-zinc-700 hover:border-zinc-500'
              )}
            >
              <UploadIcon className="w-20 h-20 text-gray-500 mb-6" />
              <p className="text-white font-semibold text-lg mb-2">
                {dragActive ? 'Drop video here' : 'Choose video to upload'}
              </p>
              <p className="text-gray-400 text-sm mb-1">
                Or drag and drop
              </p>
              <p className="text-gray-500 text-xs">
                MP4, WebM or MOV (max 100MB)
              </p>

              <div className="mt-8">
                <button
                  type="button"
                  className="px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Select File
                </button>
              </div>
            </div>
          ) : (
            <div className="relative aspect-[9/16] bg-zinc-900 rounded-xl overflow-hidden">
              <video
                src={previewUrl!}
                className="w-full h-full object-contain"
                controls
                autoPlay
                muted
                loop
              />
              <button
                onClick={handleRemoveFile}
                className="absolute top-3 right-3 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white transition-colors"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="flex flex-col justify-center space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">
              Upload Guidelines
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckIcon className="w-4 h-4 text-primary-400" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">Video Format</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    MP4, WebM, or MOV files supported
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckIcon className="w-4 h-4 text-primary-400" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">File Size</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Maximum 100MB per video
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckIcon className="w-4 h-4 text-primary-400" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">Aspect Ratio</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Vertical (9:16) recommended for best experience
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckIcon className="w-4 h-4 text-primary-400" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">Quality</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    1080p or higher for best playback quality
                  </p>
                </div>
              </div>
            </div>
          </div>

          {file && (
            <div className="pt-4 border-t border-zinc-800">
              <h4 className="text-sm font-medium text-white mb-3">Selected File</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Name:</span>
                  <span className="text-white truncate ml-2 max-w-[200px]">
                    {file.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Size:</span>
                  <span className="text-white">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Type:</span>
                  <span className="text-white">{file.type}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex justify-end gap-3">
        <button
          onClick={onNext}
          disabled={!file}
          className="px-8 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-zinc-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function DraftIcon({ className }: { className?: string }) {
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
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}
