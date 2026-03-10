'use client';

import { twMerge } from 'tailwind-merge';

interface Step5ReviewProps {
  file: File;
  previewUrl: string;
  title: string;
  description: string;
  tags: string[];
  coverImage: {
    type: 'frame' | 'custom';
    data: string;
    timestamp?: number;
  } | null;
  visibility: 'public' | 'followers' | 'private' | 'unlisted';
  allowComments: boolean;
  allowDuets: boolean;
  allowStitches: boolean;
  uploadProgress: number;
  processingStatus: string | null;
  isUploading: boolean;
  error: string | null;
  onPublish: () => void;
  onBack: () => void;
  onEdit: (step: number) => void;
}

const VISIBILITY_LABELS = {
  public: 'Public',
  followers: 'Followers only',
  private: 'Private',
  unlisted: 'Unlisted',
};

export function Step5Review({
  file,
  previewUrl,
  title,
  description,
  tags,
  coverImage,
  visibility,
  allowComments,
  allowDuets,
  allowStitches,
  uploadProgress,
  processingStatus,
  isUploading,
  error,
  onPublish,
  onBack,
  onEdit,
}: Step5ReviewProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Review and publish</h2>
        <p className="text-gray-400">
          Make sure everything looks good before publishing
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Video Preview */}
        <div className="space-y-4">
          <div className="aspect-[9/16] bg-zinc-900 rounded-xl overflow-hidden relative">
            {coverImage ? (
              <img
                src={coverImage.data}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            ) : (
              <video
                src={previewUrl}
                className="w-full h-full object-contain"
                controls
                muted
                loop
              />
            )}
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3">
                <p className="text-white font-semibold text-sm line-clamp-2">
                  {title || 'Untitled Video'}
                </p>
              </div>
            </div>
          </div>

          {/* File Info */}
          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
            <h4 className="text-sm font-medium text-white mb-3">File Details</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">File:</span>
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
        </div>

        {/* Right: Details Review */}
        <div className="space-y-6">
          {/* Video Details */}
          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white">Video Details</h4>
              <button
                onClick={() => onEdit(1)}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                Edit
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">Title</p>
                <p className="text-sm text-white">{title}</p>
              </div>
              {description && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-white line-clamp-3">{description}</p>
                </div>
              )}
              {tags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-zinc-800 text-white rounded text-xs"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cover Image */}
          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white">Cover Image</h4>
              <button
                onClick={() => onEdit(2)}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                Edit
              </button>
            </div>
            <div className="flex items-center gap-3">
              {coverImage && (
                <img
                  src={coverImage.data}
                  alt="Cover"
                  className="w-16 h-28 object-cover rounded"
                />
              )}
              <div className="text-xs text-gray-400">
                {coverImage?.type === 'custom' ? (
                  <span>Custom uploaded image</span>
                ) : (
                  <span>
                    Video frame at {coverImage?.timestamp?.toFixed(1)}s
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-white">Settings</h4>
              <button
                onClick={() => onEdit(3)}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                Edit
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Visibility:</span>
                <span className="text-white">{VISIBILITY_LABELS[visibility]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Comments:</span>
                <span className={twMerge('font-medium', allowComments ? 'text-green-400' : 'text-gray-500')}>
                  {allowComments ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Duets:</span>
                <span className={twMerge('font-medium', allowDuets ? 'text-green-400' : 'text-gray-500')}>
                  {allowDuets ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stitches:</span>
                <span className={twMerge('font-medium', allowStitches ? 'text-green-400' : 'text-gray-500')}>
                  {allowStitches ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white font-medium">
                    {processingStatus || 'Uploading...'}
                  </span>
                  <span className="text-gray-400">{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                {processingStatus && (
                  <p className="text-xs text-gray-400">
                    This may take a few moments...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
              <div className="flex gap-3">
                <ErrorIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-200 mb-1">
                    Upload failed
                  </p>
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          {!isUploading && !error && (
            <div className="p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <div className="flex gap-3">
                <InfoIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-sm text-blue-200 mb-1">
                    Ready to publish?
                  </p>
                  <p className="text-xs text-blue-300">
                    Your video will be processed and published according to your
                    settings. This usually takes a few minutes.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex justify-between gap-3">
        <button
          onClick={onBack}
          disabled={isUploading}
          className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onPublish}
          disabled={isUploading}
          className="px-8 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {isUploading ? (
            <>
              <SpinnerIcon className="w-5 h-5 animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <PublishIcon className="w-5 h-5" />
              Publish Video
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ErrorIcon({ className }: { className?: string }) {
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
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
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
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}

function PublishIcon({ className }: { className?: string }) {
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
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
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
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}
