'use client';

import { useUploadDraftStore, type UploadDraft } from '@/stores/upload-draft-store';
import { twMerge } from 'tailwind-merge';

interface DraftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadDraft: (draftId: string) => void;
}

export function DraftsModal({ isOpen, onClose, onLoadDraft }: DraftsModalProps) {
  const { drafts, deleteDraft, currentDraft } = useUploadDraftStore();

  if (!isOpen) return null;

  const sortedDrafts = [...drafts].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleLoadDraft = (draftId: string) => {
    onLoadDraft(draftId);
    onClose();
  };

  const handleDeleteDraft = (draftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this draft?')) {
      deleteDraft(draftId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[80vh] bg-zinc-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-bold text-white">Your Drafts</h2>
            <p className="text-sm text-gray-400 mt-1">
              {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'} saved
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <CloseIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Drafts List */}
        <div className="flex-1 overflow-y-auto p-6">
          {sortedDrafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <DraftIcon className="w-16 h-16 text-gray-600 mb-4" />
              <p className="text-white font-medium mb-2">No drafts yet</p>
              <p className="text-sm text-gray-400">
                Your upload drafts will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedDrafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  isCurrent={currentDraft?.id === draft.id}
                  onLoad={() => handleLoadDraft(draft.id)}
                  onDelete={(e) => handleDeleteDraft(draft.id, e)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DraftCardProps {
  draft: UploadDraft;
  isCurrent: boolean;
  onLoad: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function DraftCard({ draft, isCurrent, onLoad, onDelete }: DraftCardProps) {
  const timeSince = getTimeSince(new Date(draft.updatedAt));
  const progressPercentage = ((draft.currentStep + 1) / 5) * 100;

  return (
    <button
      onClick={onLoad}
      className={twMerge(
        'w-full p-4 rounded-lg border transition-all text-left hover:scale-[1.02]',
        isCurrent
          ? 'border-primary-500 bg-primary-500/10'
          : 'border-zinc-800 bg-zinc-800/50 hover:border-zinc-700'
      )}
    >
      <div className="flex gap-4">
        {/* Preview */}
        <div className="w-20 h-28 bg-zinc-900 rounded overflow-hidden flex-shrink-0">
          {draft.previewUrl ? (
            <video
              src={draft.previewUrl}
              className="w-full h-full object-cover"
              muted
            />
          ) : draft.coverImage?.data ? (
            <img
              src={draft.coverImage.data}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <VideoIcon className="w-8 h-8 text-gray-600" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium truncate">
                {draft.title || draft.file?.name || 'Untitled'}
              </h3>
              {isCurrent && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs font-medium rounded">
                  Current
                </span>
              )}
            </div>
            <button
              onClick={onDelete}
              className="p-1 hover:bg-red-900/30 rounded text-gray-400 hover:text-red-400 transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">
                  Step {draft.currentStep + 1} of 5
                </span>
                <span className="text-xs text-gray-500">{timeSince}</span>
              </div>
              <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {draft.file && (
                <span>{(draft.file.size / (1024 * 1024)).toFixed(1)} MB</span>
              )}
              {draft.tags.length > 0 && (
                <span>{draft.tags.length} tags</span>
              )}
              <span className="capitalize">{draft.visibility}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function getTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
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

function DraftIcon({ className }: { className?: string }) {
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
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
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
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}
