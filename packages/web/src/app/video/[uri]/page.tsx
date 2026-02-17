'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { VideoPlayer } from '@/components/VideoPlayer';
import { VideoActions } from '@/components/VideoActions';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function VideoPage() {
  const params = useParams();
  const router = useRouter();
  const uri = decodeURIComponent(params.uri as string);
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['video', uri],
    queryFn: () => api.getVideo(uri),
  });

  const video = data?.video;

  const getVideoUrl = () => {
    if (!video) return '';
    const url = video.video?.hlsPlaylist || video.hlsPlaylist || video.video?.cdnUrl || video.cdnUrl;
    if (!url) return '';
    return url.startsWith('/') ? `http://localhost:3002${url}` : url;
  };

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="flex h-screen">
          {/* Video Section */}
          <div className="flex-1 flex items-center justify-center bg-black relative">
            {/* Back button */}
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            >
              <BackIcon className="w-6 h-6 text-white" />
            </button>

            {isLoading ? (
              <div className="animate-pulse w-full max-w-md aspect-[9/16] bg-surface rounded-lg" />
            ) : error || !video ? (
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white mb-2">Video not found</h2>
                <p className="text-gray-400 mb-4">This video may have been removed or is unavailable.</p>
                <Link href="/" className="text-accent hover:underline">
                  Go back home
                </Link>
              </div>
            ) : (
              <div className="relative w-full max-w-md aspect-[9/16]">
                <VideoPlayer
                  src={getVideoUrl()}
                  poster={video.video?.thumbnail || video.thumbnailUrl}
                  autoPlay
                  loop
                  muted={false}
                  className="w-full h-full rounded-lg"
                />

                {/* Video Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  {/* Author */}
                  <Link
                    href={`/profile/${video.author.handle}`}
                    className="flex items-center gap-3 mb-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-surface overflow-hidden">
                      {video.author.avatar ? (
                        <img
                          src={video.author.avatar}
                          alt={video.author.displayName || video.author.handle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                          {video.author.handle[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-white font-semibold">
                        {video.author.displayName || `@${video.author.handle}`}
                      </p>
                      <p className="text-gray-300 text-sm">@{video.author.handle}</p>
                    </div>
                  </Link>

                  {/* Caption */}
                  {video.caption && (
                    <p className="text-white text-sm mb-2">{video.caption}</p>
                  )}

                  {/* Tags */}
                  {video.tags && video.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {video.tags.map((tag) => (
                        <Link
                          key={tag}
                          href={`/tag/${encodeURIComponent(tag)}`}
                          className="text-accent text-sm hover:underline"
                        >
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Actions & Comments */}
          {video && (
            <div className="w-96 border-l border-border bg-background flex flex-col">
              <div className="p-4 border-b border-border">
                <VideoActions video={video} />
              </div>
              {/* Comments would go here */}
              <div className="flex-1 p-4 overflow-y-auto">
                <h3 className="font-semibold text-text-primary mb-4">Comments</h3>
                <p className="text-text-muted text-sm">Click the comment icon to view all comments.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}
