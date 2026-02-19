'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

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
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(5);

  const { data: videoData, isLoading: videoLoading } = useQuery({
    queryKey: ['video', originalUri],
    queryFn: () => api.getVideo(originalUri!),
    enabled: !!originalUri,
  });

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login');
    return null;
  }

  const originalVideo = videoData?.video;
  const isLoading = authLoading || videoLoading;
  const duration = originalVideo?.video?.duration || originalVideo?.duration || 60;

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
                Original video not found
              </h2>
              <p className="text-text-muted mb-4">
                Select a video to create a loop from.
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
                  Select Clip
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
                    Clip Range
                  </h3>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-text-muted block mb-1">Start</label>
                      <input
                        type="number"
                        min={0}
                        max={duration - 1}
                        value={startTime}
                        onChange={(e) => setStartTime(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-text-muted block mb-1">End</label>
                      <input
                        type="number"
                        min={startTime + 1}
                        max={duration}
                        value={endTime}
                        onChange={(e) => setEndTime(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-text-muted mt-2">
                    Clip duration: {endTime - startTime}s (max 5s)
                  </p>
                </div>
              </div>

              {/* Recording area */}
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Your Loop
                </h2>
                <div className="aspect-[9/16] bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center p-8 text-center">
                  <CameraIcon className="w-16 h-16 text-text-muted mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">
                    Record your video
                  </h3>
                  <p className="text-text-muted mb-6 text-sm">
                    The selected clip will be included in your video.
                  </p>
                  <button
                    disabled
                    className="px-6 py-3 bg-accent/50 text-white rounded-lg font-medium cursor-not-allowed"
                  >
                    Camera recording coming soon
                  </button>
                  <p className="text-text-muted text-xs mt-4">
                    For now, upload a video from the main create page
                  </p>
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
                <li>1. Select a clip (up to 5 seconds) from the original video</li>
                <li>2. Record or upload your response video</li>
                <li>3. The clip plays before your video</li>
                <li>4. Credit is given to the original creator</li>
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

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
      />
    </svg>
  );
}
