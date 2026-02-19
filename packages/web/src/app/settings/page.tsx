'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        // Redirect to profile edit with settings tab
        router.replace('/profile/edit?tab=settings');
      } else {
        // Redirect to login if not authenticated
        router.replace('/login?redirect=/profile/edit');
      }
    }
  }, [user, isLoading, router]);

  // Show loading while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
