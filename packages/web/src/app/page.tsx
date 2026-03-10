import { VideoFeed } from '@/components/VideoFeed';
import { Sidebar } from '@/components/Sidebar';
import { FeedTabsHeader } from '@/components/FeedTabsHeader';

export default function HomePage() {
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
