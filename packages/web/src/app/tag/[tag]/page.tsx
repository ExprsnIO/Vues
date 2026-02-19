'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { VideoFeed } from '@/components/VideoFeed';
import { api } from '@/lib/api';

export default function TagPage() {
  const params = useParams();
  const tag = decodeURIComponent(params.tag as string).replace(/^#/, '');

  // Fetch tag info including video count
  const { data: tagData } = useQuery({
    queryKey: ['tag', tag],
    queryFn: () => api.getVideosByTag(tag, { limit: 1 }),
  });

  const videoCount = tagData?.tag?.videoCount;

  const formatVideoCount = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        {/* Tag Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
                <HashIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">#{tag}</h1>
                <p className="text-text-muted">
                  {videoCount !== undefined ? (
                    <>{formatVideoCount(videoCount)} videos</>
                  ) : (
                    'Discover videos with this hashtag'
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Video Feed */}
        <VideoFeed feedType={`tag:${tag}`} />
      </main>
    </div>
  );
}

function HashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
    </svg>
  );
}
