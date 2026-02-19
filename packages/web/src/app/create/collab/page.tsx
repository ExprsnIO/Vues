'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

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
                Original video not found
              </h2>
              <p className="text-text-muted mb-4">
                Select a video to create a collab with.
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

              {/* Recording area */}
              <div>
                <h2 className="text-lg font-semibold text-text-primary mb-4">
                  Your Collab
                </h2>
                <div className="aspect-[9/16] bg-surface rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center p-8 text-center">
                  <CameraIcon className="w-16 h-16 text-text-muted mb-4" />
                  <h3 className="text-lg font-medium text-text-primary mb-2">
                    Record your video
                  </h3>
                  <p className="text-text-muted mb-6 text-sm">
                    Your video will play side-by-side with the original.
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

          {/* Layout options */}
          {originalVideo && (
            <div className="mt-8 p-6 bg-surface rounded-xl">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Layout
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <LayoutOption
                  name="Side by Side"
                  description="Videos play next to each other"
                  selected
                />
                <LayoutOption
                  name="React"
                  description="Your video in corner"
                />
                <LayoutOption
                  name="Green Screen"
                  description="Original as your background"
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function LayoutOption({
  name,
  description,
  selected = false,
}: {
  name: string;
  description: string;
  selected?: boolean;
}) {
  return (
    <button
      className={`p-4 rounded-lg border text-left transition-colors ${
        selected
          ? 'border-accent bg-accent/10'
          : 'border-border hover:bg-surface-hover'
      }`}
    >
      <h4 className={`font-medium ${selected ? 'text-accent' : 'text-text-primary'}`}>
        {name}
      </h4>
      <p className="text-sm text-text-muted mt-1">{description}</p>
    </button>
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
