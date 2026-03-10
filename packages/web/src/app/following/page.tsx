'use client';

import Link from 'next/link';
import { VideoFeed } from '@/components/VideoFeed';
import { Sidebar } from '@/components/Sidebar';
import { FeedTabsHeader } from '@/components/FeedTabsHeader';
import { useAuth } from '@/lib/auth-context';

export default function FollowingPage() {
  const { user, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0 relative">
        <FeedTabsHeader />
        {isLoading ? (
          <div className="h-screen flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !user ? (
          <div className="h-screen flex flex-col items-center justify-center px-4 text-center">
            <FollowingIcon className="w-20 h-20 text-text-muted mb-6" />
            <h1 className="text-2xl font-bold text-text-primary mb-3">
              Sign in to see your Following feed
            </h1>
            <p className="text-text-muted mb-6 max-w-md">
              Follow creators to see their latest videos here. Sign in or create an account to get started.
            </p>
            <div className="flex gap-4">
              <Link
                href="/login"
                className="px-8 py-3 bg-accent hover:bg-accent-hover text-text-inverse font-medium rounded-lg transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="px-8 py-3 border border-border text-text-primary hover:bg-surface font-medium rounded-lg transition-colors"
              >
                Sign up
              </Link>
            </div>
          </div>
        ) : (
          <VideoFeed feedType="following" />
        )}
      </main>
    </div>
  );
}

function FollowingIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}
