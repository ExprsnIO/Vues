'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ACCEPTED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

export default function UploadPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');

      // Step 1: Get presigned upload URL
      const { uploadId, uploadUrl } = await api.getUploadUrl(file.type);

      // Step 2: Upload file directly to S3
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error('Upload failed'));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      // Step 3: Trigger processing
      setProcessingStatus('Processing video...');
      await api.completeUpload(uploadId);

      // Step 4: Poll for processing status
      let status = 'processing';
      while (status === 'processing' || status === 'pending') {
        await new Promise((r) => setTimeout(r, 2000));
        const result = await api.getUploadStatus(uploadId);
        status = result.status;
        if (status === 'failed') {
          throw new Error(result.error || 'Processing failed');
        }
      }

      // Step 5: Get video metadata
      const video = document.createElement('video');
      video.src = preview!;
      await new Promise((r) => (video.onloadedmetadata = r));

      // Step 6: Create post
      setProcessingStatus('Publishing...');
      const result = await api.createPost({
        uploadId,
        caption,
        tags,
        visibility,
        aspectRatio: {
          width: video.videoWidth,
          height: video.videoHeight,
        },
        duration: Math.round(video.duration),
      });

      return result;
    },
    onSuccess: () => {
      router.push('/');
    },
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
        alert('Please select a valid video file (MP4, WebM, or MOV)');
        return;
      }

      if (selectedFile.size > MAX_FILE_SIZE) {
        alert('File size must be less than 100MB');
        return;
      }

      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
    },
    []
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const input = fileInputRef.current;
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(droppedFile);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, []);

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (tag && !tags.includes(tag) && tags.length < 10) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  // Redirect if not logged in
  if (!isAuthLoading && !user) {
    router.push('/login');
    return null;
  }

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-60 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Upload video</h1>

          <div className="grid grid-cols-2 gap-8">
            {/* Left: Video preview / drop zone */}
            <div>
              {preview ? (
                <div className="relative aspect-[9/16] bg-zinc-900 rounded-xl overflow-hidden">
                  <video
                    src={preview}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    muted
                    loop
                  />
                  <button
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white"
                  >
                    <CloseIcon className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-[9/16] bg-zinc-900 border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-zinc-500 transition-colors"
                >
                  <UploadIcon className="w-16 h-16 text-gray-500 mb-4" />
                  <p className="text-white font-medium mb-2">
                    Drag and drop or click to upload
                  </p>
                  <p className="text-gray-500 text-sm">
                    MP4, WebM or MOV up to 100MB
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Right: Form */}
            <div className="space-y-6">
              {/* Caption */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Caption
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Write a caption..."
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1 text-right">
                  {caption.length}/2000
                </p>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Tags
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="Add a tag"
                    className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={handleAddTag}
                    disabled={!tagInput.trim() || tags.length >= 10}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-800 text-white rounded-full text-sm"
                    >
                      #{tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-red-400"
                      >
                        <CloseIcon className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Who can view this video
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setVisibility('public')}
                    className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                      visibility === 'public'
                        ? 'bg-primary-500 text-white'
                        : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
                    }`}
                  >
                    Public
                  </button>
                  <button
                    onClick={() => setVisibility('followers')}
                    className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                      visibility === 'followers'
                        ? 'bg-primary-500 text-white'
                        : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
                    }`}
                  >
                    Followers only
                  </button>
                </div>
              </div>

              {/* Upload progress */}
              {uploadMutation.isPending && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300">
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
                </div>
              )}

              {/* Error */}
              {uploadMutation.isError && (
                <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
                  {uploadMutation.error instanceof Error
                    ? uploadMutation.error.message
                    : 'Upload failed'}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={() => uploadMutation.mutate()}
                disabled={!file || uploadMutation.isPending}
                className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </main>
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}
