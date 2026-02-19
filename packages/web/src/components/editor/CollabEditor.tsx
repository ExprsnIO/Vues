'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type CollabLayout = 'side-by-side' | 'react' | 'green-screen';

export interface CollabPublishData {
  originalUri: string;
  responseVideoFile: File;
  layout: CollabLayout;
  caption: string;
}

interface CollabEditorProps {
  originalVideo: {
    uri: string;
    thumbnailUrl?: string;
    videoUrl?: string;
    duration: number;
    author: {
      handle: string;
      displayName?: string;
    };
    caption?: string;
  };
  onPublish: (data: CollabPublishData) => void;
  onCancel: () => void;
  isPublishing?: boolean;
  publishStatus?: string;
  uploadProgress?: number;
}

export function CollabEditor({
  originalVideo,
  onPublish,
  onCancel,
  isPublishing = false,
  publishStatus,
  uploadProgress = 0,
}: CollabEditorProps) {
  const [layout, setLayout] = useState<CollabLayout>('side-by-side');
  const [responseVideo, setResponseVideo] = useState<File | null>(null);
  const [responseVideoUrl, setResponseVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const responseVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync playback between videos
  useEffect(() => {
    const original = originalVideoRef.current;
    const response = responseVideoRef.current;

    if (!original || !response) return;

    const handleOriginalPlay = () => {
      response.play().catch(() => {});
      setIsPlaying(true);
    };

    const handleOriginalPause = () => {
      response.pause();
      setIsPlaying(false);
    };

    const handleOriginalSeek = () => {
      response.currentTime = original.currentTime;
    };

    original.addEventListener('play', handleOriginalPlay);
    original.addEventListener('pause', handleOriginalPause);
    original.addEventListener('seeked', handleOriginalSeek);

    return () => {
      original.removeEventListener('play', handleOriginalPlay);
      original.removeEventListener('pause', handleOriginalPause);
      original.removeEventListener('seeked', handleOriginalSeek);
    };
  }, [responseVideoUrl]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert('Please select a video file');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      alert('File size must be less than 100MB');
      return;
    }

    setResponseVideo(file);
    setResponseVideoUrl(URL.createObjectURL(file));
  }, []);

  const handlePublish = useCallback(() => {
    if (!responseVideo) {
      alert('Please select a response video');
      return;
    }

    onPublish({
      originalUri: originalVideo.uri,
      responseVideoFile: responseVideo,
      layout,
      caption,
    });
  }, [responseVideo, originalVideo.uri, layout, caption, onPublish]);

  const togglePlayback = useCallback(() => {
    const original = originalVideoRef.current;
    if (!original) return;

    if (original.paused) {
      original.play();
    } else {
      original.pause();
    }
  }, []);

  const getLayoutStyles = () => {
    switch (layout) {
      case 'side-by-side':
        return {
          container: 'flex flex-row',
          original: 'w-1/2',
          response: 'w-1/2',
        };
      case 'react':
        return {
          container: 'relative',
          original: 'w-full',
          response: 'absolute bottom-4 right-4 w-1/3 rounded-xl overflow-hidden shadow-lg',
        };
      case 'green-screen':
        return {
          container: 'relative',
          original: 'w-full opacity-60',
          response: 'absolute inset-0',
        };
      default:
        return {
          container: 'flex flex-row',
          original: 'w-1/2',
          response: 'w-1/2',
        };
    }
  };

  const layoutStyles = getLayoutStyles();

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4">
        <button
          onClick={onCancel}
          disabled={isPublishing}
          className="px-4 py-2 text-text-muted hover:text-text-primary transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <h1 className="text-lg font-semibold text-text-primary">Create Collab</h1>
        <button
          onClick={handlePublish}
          disabled={!responseVideo || isPublishing}
          className="px-6 py-2 bg-accent text-text-inverse font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {isPublishing ? 'Publishing...' : 'Publish'}
        </button>
      </header>

      {/* Publishing progress */}
      {isPublishing && (
        <div className="bg-surface border-b border-border px-4 py-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-text-primary">{publishStatus || 'Publishing...'}</span>
            <span className="text-text-muted">{uploadProgress}%</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview area */}
        <div className="flex-1 flex flex-col p-6">
          <h2 className="text-sm font-medium text-text-muted mb-4">Preview</h2>

          {/* Video preview */}
          <div className="flex-1 flex items-center justify-center bg-black rounded-xl overflow-hidden">
            <div className={`aspect-[9/16] h-full max-w-full ${layoutStyles.container}`}>
              {/* Original video */}
              <div className={layoutStyles.original}>
                <video
                  ref={originalVideoRef}
                  src={originalVideo.videoUrl}
                  poster={originalVideo.thumbnailUrl}
                  className="w-full h-full object-cover"
                  loop
                  playsInline
                  muted={layout === 'green-screen'}
                />
              </div>

              {/* Response video or placeholder */}
              <div className={layoutStyles.response}>
                {responseVideoUrl ? (
                  <video
                    ref={responseVideoRef}
                    src={responseVideoUrl}
                    className="w-full h-full object-cover"
                    loop
                    playsInline
                    muted
                  />
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-full bg-surface flex flex-col items-center justify-center cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <UploadIcon className="w-12 h-12 text-text-muted mb-3" />
                    <p className="text-text-primary font-medium">Add your video</p>
                    <p className="text-text-muted text-sm mt-1">Click to upload</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Playback controls */}
          <div className="mt-4 flex items-center justify-center gap-4">
            <button
              onClick={togglePlayback}
              disabled={!responseVideoUrl}
              className="p-3 bg-surface rounded-full hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              {isPlaying ? (
                <PauseIcon className="w-6 h-6 text-text-primary" />
              ) : (
                <PlayIcon className="w-6 h-6 text-text-primary" />
              )}
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-surface border-l border-border p-4 overflow-y-auto">
          {/* Response video upload */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">Your Video</h3>
            {responseVideo ? (
              <div className="relative">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    src={responseVideoUrl!}
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => {
                    setResponseVideo(null);
                    setResponseVideoUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                >
                  <CloseIcon className="w-4 h-4 text-white" />
                </button>
                <p className="text-xs text-text-muted mt-2 truncate">{responseVideo.name}</p>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-video bg-background border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center hover:border-accent/50 transition-colors"
              >
                <UploadIcon className="w-8 h-8 text-text-muted mb-2" />
                <span className="text-text-primary text-sm font-medium">Upload video</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Layout selection */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">Layout</h3>
            <div className="grid grid-cols-3 gap-2">
              <LayoutButton
                name="Side by Side"
                icon={<SideBySideIcon />}
                selected={layout === 'side-by-side'}
                onClick={() => setLayout('side-by-side')}
              />
              <LayoutButton
                name="React"
                icon={<ReactIcon />}
                selected={layout === 'react'}
                onClick={() => setLayout('react')}
              />
              <LayoutButton
                name="Green Screen"
                icon={<GreenScreenIcon />}
                selected={layout === 'green-screen'}
                onClick={() => setLayout('green-screen')}
              />
            </div>
          </div>

          {/* Caption */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-primary mb-3">Caption</h3>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={`Collab with @${originalVideo.author.handle}`}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none text-sm"
            />
            <p className="text-xs text-text-muted mt-1 text-right">{caption.length}/500</p>
          </div>

          {/* Original video info */}
          <div className="p-3 bg-background rounded-lg">
            <p className="text-xs text-text-muted mb-2">Original video by</p>
            <p className="text-sm text-text-primary font-medium">
              @{originalVideo.author.handle}
            </p>
            {originalVideo.caption && (
              <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                {originalVideo.caption}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutButton({
  name,
  icon,
  selected,
  onClick,
}: {
  name: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
        selected
          ? 'border-accent bg-accent/10'
          : 'border-border hover:border-accent/50'
      }`}
    >
      <div className={`w-8 h-8 ${selected ? 'text-accent' : 'text-text-muted'}`}>
        {icon}
      </div>
      <span className={`text-xs ${selected ? 'text-accent' : 'text-text-muted'}`}>
        {name}
      </span>
    </button>
  );
}

// Icons
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function SideBySideIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="4" width="12" height="24" rx="2" />
      <rect x="18" y="4" width="12" height="24" rx="2" />
    </svg>
  );
}

function ReactIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="4" width="28" height="24" rx="2" />
      <rect x="18" y="16" width="10" height="10" rx="1" />
    </svg>
  );
}

function GreenScreenIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="4" width="28" height="24" rx="2" />
      <circle cx="16" cy="14" r="4" />
      <path d="M10 28c0-4 3-6 6-6s6 2 6 6" />
    </svg>
  );
}
