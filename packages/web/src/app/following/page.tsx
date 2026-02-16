import { VideoFeed } from '@/components/VideoFeed';
import { Sidebar } from '@/components/Sidebar';

export default function FollowingPage() {
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 ml-60">
        <VideoFeed feedType="following" />
      </main>
    </div>
  );
}
