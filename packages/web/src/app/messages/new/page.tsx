'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useDebounce } from '@/lib/hooks';
import toast from 'react-hot-toast';

export default function NewMessagePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);

  // Search for users
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['userSearch', debouncedQuery],
    queryFn: () => api.searchActors(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  // Get following list as suggestions
  const { data: followingData } = useQuery({
    queryKey: ['following', user?.did],
    queryFn: () => api.getFollowing(user!.did, { limit: 20 }),
    enabled: !!user && !debouncedQuery,
  });

  // Create or get conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: (did: string) => api.getOrCreateConversation(did),
    onSuccess: (data) => {
      router.push(`/messages/${data.conversation.id}`);
    },
    onError: () => {
      toast.error('Failed to start conversation');
    },
  });

  const handleSelectUser = useCallback(
    (did: string) => {
      createConversationMutation.mutate(did);
    },
    [createConversationMutation]
  );

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push('/login?redirect=/messages/new');
    return null;
  }

  const searchResults = searchData?.actors || [];
  const suggestions = followingData?.following || [];
  const showSuggestions = !debouncedQuery && suggestions.length > 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex-shrink-0 h-16 bg-surface border-b border-border flex items-center px-4 gap-4">
        <Link
          href="/messages"
          className="p-2 -ml-2 text-text-muted hover:text-text-primary rounded-lg transition-colors"
        >
          <BackIcon className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-text-primary">New Message</h1>
      </header>

      {/* Search */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a user..."
            autoFocus
            className="w-full pl-12 pr-4 py-3 bg-background border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : debouncedQuery.length >= 2 ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p className="text-text-muted">No users found for "{debouncedQuery}"</p>
            </div>
          ) : (
            <div>
              <p className="px-4 py-2 text-xs font-medium text-text-muted uppercase">
                Search Results
              </p>
              <div className="divide-y divide-border">
                {searchResults.map((actor) => (
                  <UserRow
                    key={actor.did}
                    user={actor}
                    onClick={() => handleSelectUser(actor.did)}
                    isLoading={createConversationMutation.isPending}
                  />
                ))}
              </div>
            </div>
          )
        ) : showSuggestions ? (
          <div>
            <p className="px-4 py-2 text-xs font-medium text-text-muted uppercase">
              Suggested
            </p>
            <div className="divide-y divide-border">
              {suggestions.map((follow) => (
                <UserRow
                  key={follow.did}
                  user={follow}
                  onClick={() => handleSelectUser(follow.did)}
                  isLoading={createConversationMutation.isPending}
                />
              ))}
            </div>
          </div>
        ) : debouncedQuery.length > 0 && debouncedQuery.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-text-muted">Type at least 2 characters to search</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <SearchIcon className="w-12 h-12 text-text-muted mb-4" />
            <p className="text-text-muted">Search for someone to message</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow({
  user,
  onClick,
  isLoading,
}: {
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface transition-colors disabled:opacity-50"
    >
      <div className="w-12 h-12 rounded-full bg-surface overflow-hidden flex-shrink-0">
        {user.avatar ? (
          <img src={user.avatar} alt={user.handle} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-primary font-bold">
            {user.handle[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="font-medium text-text-primary truncate">
          {user.displayName || `@${user.handle}`}
        </p>
        <p className="text-sm text-text-muted truncate">@{user.handle}</p>
      </div>
    </button>
  );
}

// Icons
function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}
