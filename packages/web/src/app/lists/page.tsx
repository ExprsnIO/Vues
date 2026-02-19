'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { ListCard } from '@/components/ListCard';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function ListsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['lists', user?.did],
    queryFn: () => api.getLists(user!.did),
    enabled: !!user,
  });

  // Redirect if not logged in
  if (!authLoading && !user) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <ListIcon className="w-16 h-16 text-text-muted mb-4" />
            <h1 className="text-2xl font-bold text-text-primary mb-3">
              Sign in to see your lists
            </h1>
            <p className="text-text-muted mb-6 max-w-md">
              Create and manage lists to organize accounts you follow.
            </p>
            <Link
              href="/login"
              className="px-8 py-3 bg-accent hover:bg-accent-hover text-text-inverse font-medium rounded-lg transition-colors"
            >
              Log in
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const lists = data?.lists ?? [];

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-text-primary">My Lists</h1>
            <Link
              href="/lists/create"
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              New List
            </Link>
          </div>

          {/* Lists */}
          {authLoading || isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
                  <div className="w-12 h-12 rounded-lg bg-surface" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-surface rounded mb-2" />
                    <div className="h-3 w-24 bg-surface rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : lists.length > 0 ? (
            <div className="space-y-2">
              {lists.map((list) => (
                <ListCard key={list.uri} list={list} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <ListIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-text-primary mb-2">
                No lists yet
              </h2>
              <p className="text-text-muted mb-6">
                Create a list to organize accounts you want to follow together.
              </p>
              <Link
                href="/lists/create"
                className="inline-flex items-center gap-2 px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
              >
                <PlusIcon className="w-5 h-5" />
                Create your first list
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
