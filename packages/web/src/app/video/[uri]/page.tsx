import type { Metadata, ResolvingMetadata } from 'next';
import { VideoPageClient } from './VideoPageClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

interface VideoPageProps {
  params: Promise<{ uri: string }>;
}

// Fetch video data for metadata
async function getVideo(uri: string) {
  try {
    const response = await fetch(`${API_BASE}/xrpc/io.exprsn.video.getVideo?uri=${encodeURIComponent(uri)}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.video;
  } catch {
    return null;
  }
}

// Generate dynamic metadata for SEO and social sharing
export async function generateMetadata(
  { params }: VideoPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParams = await params;
  const uri = decodeURIComponent(resolvedParams.uri);
  const video = await getVideo(uri);

  // Default metadata if video not found
  if (!video) {
    return {
      title: 'Video | Exprsn',
      description: 'Watch videos on Exprsn',
    };
  }

  const title = video.caption
    ? `${video.caption.slice(0, 60)}${video.caption.length > 60 ? '...' : ''} | Exprsn`
    : `Video by @${video.author.handle} | Exprsn`;

  const description = video.caption
    ? video.caption.slice(0, 160)
    : `Watch this video by @${video.author.handle} on Exprsn`;

  const thumbnailUrl = video.video?.thumbnail || video.thumbnailUrl;
  const absoluteThumbnail = thumbnailUrl?.startsWith('/')
    ? `${API_BASE}${thumbnailUrl}`
    : thumbnailUrl;

  const videoUrl = `${APP_URL}/video/${encodeURIComponent(uri)}`;

  // Get parent metadata for fallbacks
  const previousImages = (await parent).openGraph?.images || [];

  return {
    title,
    description,
    authors: [{ name: video.author.displayName || `@${video.author.handle}` }],
    keywords: video.tags || [],
    openGraph: {
      title,
      description,
      type: 'video.other',
      url: videoUrl,
      siteName: 'Exprsn',
      images: absoluteThumbnail
        ? [
            {
              url: absoluteThumbnail,
              width: 720,
              height: 1280,
              alt: video.caption || `Video by @${video.author.handle}`,
            },
          ]
        : previousImages,
      videos: video.video?.hlsPlaylist
        ? [
            {
              url: video.video.hlsPlaylist.startsWith('/')
                ? `${API_BASE}${video.video.hlsPlaylist}`
                : video.video.hlsPlaylist,
              type: 'application/x-mpegURL',
              width: 720,
              height: 1280,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: absoluteThumbnail ? [absoluteThumbnail] : undefined,
      creator: `@${video.author.handle}`,
    },
    alternates: {
      canonical: videoUrl,
    },
    other: {
      // Additional meta tags for video platforms
      'og:video:duration': video.video?.duration?.toString() || video.duration?.toString() || undefined,
      'og:video:author': video.author.displayName || `@${video.author.handle}`,
    },
  };
}

export default async function VideoPage({ params }: VideoPageProps) {
  const resolvedParams = await params;
  const uri = decodeURIComponent(resolvedParams.uri);

  return <VideoPageClient uri={uri} />;
}
