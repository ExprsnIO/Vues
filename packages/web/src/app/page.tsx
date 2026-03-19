import { redirect } from 'next/navigation';
import { VideoFeed } from '@/components/VideoFeed';
import { Sidebar } from '@/components/Sidebar';
import { FeedTabsHeader } from '@/components/FeedTabsHeader';

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
const SETUP_API = `${API_BASE}/first-run/api`;

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Check if first-time setup is needed
  try {
    const res = await fetch(`${SETUP_API}/state`, {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.status !== 'completed') {
        redirect('/setup');
      }
    }
  } catch (err) {
    console.log('[home] Setup check failed:', (err as Error)?.message || err);
    // API unreachable or setup package not present — continue normally
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0 relative">
        <FeedTabsHeader />
        <VideoFeed feedType="foryou" />
      </main>
    </div>
  );
}
