'use client';

import { useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CollabPublishData } from '@/components/editor/CollabEditor';

// Dynamically import the editor to avoid SSR issues
const CollabEditor = dynamic(
  () => import('@/components/editor/CollabEditor').then((m) => m.CollabEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function CreateCollabPage() {
  return (
    <Suspense fallback={<CreateCollabLoading />}>
      <CreateCollabContent />
    </Suspense>
  );
}

function CreateCollabLoading() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    </div>
  );
}

function CreateCollabContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const originalUri = searchParams.get('original');
  const { user, isLoading: authLoading } = useAuth();
  const [showEditor, setShowEditor] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { data: videoData, isLoading: videoLoading } = useQuery({
    queryKey: ['video', originalUri],
    queryFn: () => api.getVideo(originalUri!),
    enabled: !!originalUri,
  });

  const publishMutation = useMutation({
    mutationFn: async (data: CollabPublishData) => {
      if (!data.responseVideoFile) {
        throw new Error('No response video selected');
      }

      // Step 1: Get presigned upload URL
      setPublishStatus('Preparing upload...');
      const { uploadId, uploadUrl } = await api.getUploadUrl(data.responseVideoFile.type);

      // Step 2: Upload file directly to S3
      setPublishStatus('Uploading video...');
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
        xhr.setRequestHeader('Content-Type', data.responseVideoFile!.type);
        xhr.send(data.responseVideoFile);
      });

      // Step 3: Trigger processing
      setPublishStatus('Processing video...');
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

      // Step 5: Get video dimensions
      const video = document.createElement('video');
      video.src = URL.createObjectURL(data.responseVideoFile);
      await new Promise((r) => (video.onloadedmetadata = r));

      // Step 6: Create the post
      setPublishStatus('Creating post...');
      const postResult = await api.createPost({
        uploadId,
        caption: data.caption || `Collab with @${originalVideo?.author?.handle}`,
        tags: ['collab'],
        visibility: 'public',
        aspectRatio: {
          width: video.videoWidth,
          height: video.videoHeight,
        },
        duration: Math.round(video.duration),
      });

      // Step 7: Create the collab link
      setPublishStatus('Creating collab...');
      await api.createCollab({
        videoUri: postResult.uri,
        originalVideoUri: data.originalUri,
        layout: data.layout,
      });

      return { success: true, uri: postResult.uri };
    },
    onSuccess: () => {
      router.push('/');
    },
    onError: (error) => {
      setPublishStatus(null);
      setUploadProgress(0);
      console.error('Failed to publish collab:', error);
    },
  });

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const originalVideo = videoData?.video;
  const isLoading = authLoading || videoLoading;
  const duration = originalVideo?.video?.duration || originalVideo?.duration || 60;

  const handlePublish = useCallback(
    (data: CollabPublishData) => {
      publishMutation.mutate(data);
    },
    [publishMutation]
  );

  const handleCancel = useCallback(() => {
    if (showEditor) {
      setShowEditor(false);
    } else {
      router.back();
    }
  }, [showEditor, router]);

  // Show the editor in fullscreen when activated
  if (showEditor && originalVideo) {
    return (
      <CollabEditor
        originalVideo={{
          uri: originalVideo.uri,
          thumbnailUrl: originalVideo.video?.thumbnail || originalVideo.thumbnailUrl,
          videoUrl: originalVideo.video?.hlsPlaylist || originalVideo.hlsPlaylist || originalVideo.video?.cdnUrl || originalVideo.cdnUrl,
          duration: duration,
          author: {
            handle: originalVideo.author.handle,
            displayName: originalVideo.author.displayName,
          },
          caption: originalVideo.caption,
        }}
        onPublish={handlePublish}
        onCancel={handleCancel}
        isPublishing={publishMutation.isPending}
        publishStatus={publishStatus || undefined}
        uploadProgress={uploadProgress}
      />
    );
  }

  // Show selection UI
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Create Collab</h1>
            <button
              onClick={() => router.back()}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !originalVideo ? (
            <div className="text-center py-20">
              <VideoIcon className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">
                Select a video to collab with
              </h2>
              <p className="text-text-muted mb-4">
                Choose a video from your feed to create a collab.
              </p>
              <Link href="/" className="text-accent hover:underline">
                Browse videos
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Original video */}
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Original Video
                </h2>
                <div className="aspect-[9/16] bg-black rounded-xl overflow-hidden relative">
                  {originalVideo.video?.thumbnail || originalVideo.thumbnailUrl ? (
                    <img
                      src={originalVideo.video?.thumbnail || originalVideo.thumbnailUrl}
                      alt="Original video"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted">
                      <VideoIcon className="w-16 h-16" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white font-medium truncate">
                      {originalVideo.caption || 'Untitled'}
                    </p>
                    <p className="text-gray-300 text-sm">
                      @{originalVideo.author?.handle}
                    </p>
                  </div>
                </div>
              </div>

              {/* CTA area */}
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Your Collab
                </h2>
                <div className="aspect-[9/16] bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center p-8 text-center">
                  <CollabIcon className="w-16 h-16 text-accent mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">
                    Ready to create your collab?
                  </h3>
                  <p className="text-text-muted mb-6 text-sm">
                    Upload your video and choose from different layouts: side-by-side, react, or green screen.
                  </p>
                  <button
                    onClick={() => setShowEditor(true)}
                    className="px-6 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors"
                  >
                    Open Editor
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          {originalVideo && (
            <div className="mt-8 p-6 bg-surface rounded-xl">
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                How Collabs work
              </h3>
              <ul className="text-text-muted text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">1.</span>
                  Upload your response video
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">2.</span>
                  Choose a layout: side-by-side, react (picture-in-picture), or green screen
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">3.</span>
                  Preview how your collab will look
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">4.</span>
                  Publish and credit is given to the original creator
                </li>
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

function CollabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h8v12H3zM13 6h8v12h-8z" />
    </svg>
  );
}
