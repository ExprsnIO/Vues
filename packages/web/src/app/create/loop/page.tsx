'use client';

import { useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { LoopPublishData } from '@/components/editor/LoopEditor';

// Dynamically import the editor to avoid SSR issues
const LoopEditor = dynamic(
  () => import('@/components/editor/LoopEditor').then((m) => m.LoopEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function CreateLoopPage() {
  return (
    <Suspense fallback={<CreateLoopLoading />}>
      <CreateLoopContent />
    </Suspense>
  );
}

function CreateLoopLoading() {
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

function CreateLoopContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const originalUri = searchParams.get('original');
  const { user, isLoading: authLoading } = useAuth();
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(5);
  const [showEditor, setShowEditor] = useState(false);

  const { data: videoData, isLoading: videoLoading } = useQuery({
    queryKey: ['video', originalUri],
    queryFn: () => api.getVideo(originalUri!),
    enabled: !!originalUri,
  });

  const publishMutation = useMutation({
    mutationFn: async (data: LoopPublishData) => {
      // TODO: Implement actual loop creation API
      // This would upload the response video and create the loop record
      console.log('Publishing loop:', data);

      // For now, simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // In production, this would call something like:
      // return api.createLoop(data);
      return { success: true };
    },
    onSuccess: () => {
      router.push('/');
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

  const handleClipChange = useCallback((start: number, end: number) => {
    setClipStart(start);
    setClipEnd(end);
  }, []);

  const handlePublish = useCallback(
    (data: LoopPublishData) => {
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
      <LoopEditor
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
        clipStart={clipStart}
        clipEnd={clipEnd}
        onClipChange={handleClipChange}
        onPublish={handlePublish}
        onCancel={handleCancel}
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
            <h1 className="text-2xl font-bold text-text-primary">Create Loop</h1>
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
                Select a video to loop
              </h2>
              <p className="text-text-muted mb-4">
                Choose a video from your feed to create a loop from.
              </p>
              <Link href="/" className="text-accent hover:underline">
                Browse videos
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Original video with clip selector */}
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

                {/* Time selector */}
                <div className="mt-4 p-4 bg-surface rounded-xl">
                  <h3 className="text-sm font-medium text-text-secondary mb-4">
                    Select Clip Range (max 5 seconds)
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs text-text-muted mb-1">
                        <span>Start: {clipStart.toFixed(1)}s</span>
                        <span>End: {clipEnd.toFixed(1)}s</span>
                      </div>
                      <div className="relative h-2 bg-background rounded-full">
                        <div
                          className="absolute h-full bg-accent rounded-full"
                          style={{
                            left: `${(clipStart / duration) * 100}%`,
                            width: `${((clipEnd - clipStart) / duration) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="text-xs text-text-muted block mb-1">Start</label>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0, duration - 1)}
                          step={0.1}
                          value={clipStart}
                          onChange={(e) => {
                            const newStart = parseFloat(e.target.value);
                            const newEnd = Math.min(newStart + 5, duration);
                            setClipStart(newStart);
                            setClipEnd(Math.max(newEnd, newStart + 1));
                          }}
                          className="w-full accent-accent"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-text-muted block mb-1">End</label>
                        <input
                          type="range"
                          min={clipStart + 1}
                          max={Math.min(clipStart + 5, duration)}
                          step={0.1}
                          value={clipEnd}
                          onChange={(e) => setClipEnd(parseFloat(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-accent mt-4 font-medium">
                    Clip duration: {(clipEnd - clipStart).toFixed(1)}s
                  </p>
                </div>
              </div>

              {/* CTA area */}
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Create Your Loop
                </h2>
                <div className="aspect-[9/16] bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center p-8 text-center">
                  <LoopIcon className="w-16 h-16 text-accent mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">
                    Ready to create your loop?
                  </h3>
                  <p className="text-text-muted mb-6 text-sm">
                    The selected clip will play before your video. Add text, effects, and more!
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
                How Loops work
              </h3>
              <ul className="text-text-muted text-sm space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">1.</span>
                  Select a clip (up to 5 seconds) from the original video
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">2.</span>
                  Upload your response video in the editor
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">3.</span>
                  Add text overlays and effects
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

function LoopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"
      />
    </svg>
  );
}
