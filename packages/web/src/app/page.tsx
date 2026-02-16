import { VideoFeed } from '@/components/VideoFeed';
import { Sidebar } from '@/components/Sidebar';

export default function HomePage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-60">
        <VideoFeed feedType="foryou" />
      </main>
    </div>
  );
}
