'use client';

import { Sidebar } from '@/components/Sidebar';

export default function ModerationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 lg:ml-60">{children}</main>
    </div>
  );
}
