'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSidebar } from '@/components/Sidebar';
import { Sidebar } from '@/components/Sidebar';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { openSettings } = useSidebar();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        // Open settings panel and redirect to home
        openSettings();
        router.replace('/');
      } else {
        // Redirect to login if not authenticated
        router.replace('/login');
      }
    }
  }, [user, isLoading, router, openSettings]);

  // Show loading while redirecting
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    </div>
  );
}
