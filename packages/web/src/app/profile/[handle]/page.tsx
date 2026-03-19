import type { Metadata, ResolvingMetadata } from 'next';
import ProfileClient from './ProfileClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

interface ProfileData {
  profile: {
    did: string;
    handle: string;
    displayName?: string;
    bio?: string;
    avatar?: string;
    followerCount: number;
    followingCount: number;
    videoCount: number;
    verified?: boolean;
  };
}

async function getProfile(handle: string): Promise<ProfileData | null> {
  try {
    const res = await fetch(`${API_URL}/xrpc/io.exprsn.actor.getProfile?actor=${encodeURIComponent(handle)}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!res.ok) {
      return null;
    }

    return res.json();
  } catch {
    return null;
  }
}

type Props = {
  params: Promise<{ handle: string }>;
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { handle } = await params;
  const data = await getProfile(handle);

  if (!data?.profile) {
    return {
      title: `@${handle} | Exprsn`,
      description: `View @${handle}'s profile on Exprsn`,
    };
  }

  const profile = data.profile;
  const displayName = profile.displayName || `@${profile.handle}`;
  const title = `${displayName} (@${profile.handle}) | Exprsn`;
  const description = profile.bio
    ? profile.bio.slice(0, 160)
    : `${displayName} on Exprsn - ${profile.followerCount.toLocaleString()} followers, ${profile.videoCount.toLocaleString()} videos`;

  const profileUrl = `${APP_URL}/profile/${profile.handle}`;

  // Get parent images (for fallback)
  const previousImages = (await parent).openGraph?.images || [];

  // Use avatar or generate a default image
  const ogImage = profile.avatar || `${APP_URL}/api/og/profile?handle=${encodeURIComponent(profile.handle)}&name=${encodeURIComponent(displayName)}&followers=${profile.followerCount}&videos=${profile.videoCount}`;

  return {
    title,
    description,

    // OpenGraph
    openGraph: {
      title,
      description,
      url: profileUrl,
      siteName: 'Exprsn',
      type: 'profile',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${displayName}'s profile picture`,
        },
        ...previousImages,
      ],
      // Profile-specific OG properties
      firstName: profile.displayName?.split(' ')[0],
      username: profile.handle,
    },

    // Twitter Card
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      creator: `@${profile.handle}`,
    },

    // Additional meta
    alternates: {
      canonical: profileUrl,
    },

    // Robots
    robots: {
      index: true,
      follow: true,
    },

    // Other
    other: {
      'profile:username': profile.handle,
    },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  return <ProfileClient handle={handle} />;
}
