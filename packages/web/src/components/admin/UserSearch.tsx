'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, AdminUserSearchResult } from '@/lib/api';
import Link from 'next/link';

interface UserSearchProps {
  onSelect?: (user: AdminUserSearchResult) => void;
  placeholder?: string;
  className?: string;
}

export function UserSearch({ onSelect, placeholder = 'Search users...', className = '' }: UserSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'userSearch', query],
    queryFn: () => api.searchAdminUsers(query, 10),
    enabled: query.length >= 2,
    staleTime: 30000,
  });

  const users = data?.users || [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (user: AdminUserSearchResult) => {
    if (onSelect) {
      onSelect(user);
    }
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        />
        {isLoading && query.length >= 2 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && query.length >= 2 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {users.length === 0 && !isLoading ? (
            <div className="p-4 text-center text-text-muted text-sm">
              No users found
            </div>
          ) : (
            users.map((user) => (
              <UserSearchItem
                key={user.did}
                user={user}
                onSelect={handleSelect}
                linkToProfile={!onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface UserSearchItemProps {
  user: AdminUserSearchResult;
  onSelect: (user: AdminUserSearchResult) => void;
  linkToProfile?: boolean;
}

function UserSearchItem({ user, onSelect, linkToProfile }: UserSearchItemProps) {
  const content = (
    <div className="flex items-center gap-3 p-3 hover:bg-surface-hover cursor-pointer transition-colors">
      {user.avatar ? (
        <img
          src={user.avatar}
          alt=""
          className="w-10 h-10 rounded-full object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted font-medium">
          {user.handle[0]?.toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary truncate">
            @{user.handle}
          </span>
          {user.verified && (
            <VerifiedIcon className="w-4 h-4 text-accent flex-shrink-0" />
          )}
        </div>
        {user.displayName && (
          <p className="text-sm text-text-muted truncate">{user.displayName}</p>
        )}
      </div>
      <ChevronRightIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
    </div>
  );

  if (linkToProfile) {
    return (
      <Link href={`/admin/users/${encodeURIComponent(user.did)}`}>
        {content}
      </Link>
    );
  }

  return <div onClick={() => onSelect(user)}>{content}</div>;
}

// Command palette style search (for global use)
export function UserSearchModal({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: AdminUserSearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'userSearch', query],
    queryFn: () => api.searchAdminUsers(query, 15),
    enabled: query.length >= 2 && isOpen,
  });

  const users = data?.users || [];

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl mx-4 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <SearchIcon className="w-5 h-5 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users by handle, name, or DID..."
            className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          {isLoading && (
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          )}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-8 text-center text-text-muted">
              Type at least 2 characters to search
            </div>
          ) : users.length === 0 && !isLoading ? (
            <div className="p-8 text-center text-text-muted">
              No users found for "{query}"
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.did}
                onClick={() => {
                  onSelect(user);
                  onClose();
                }}
                className="flex items-center gap-3 p-4 hover:bg-surface-hover cursor-pointer transition-colors border-b border-border last:border-b-0"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-text-muted font-medium">
                    {user.handle[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">
                      @{user.handle}
                    </span>
                    {user.verified && (
                      <VerifiedIcon className="w-4 h-4 text-accent" />
                    )}
                  </div>
                  {user.displayName && (
                    <p className="text-sm text-text-muted truncate">
                      {user.displayName}
                    </p>
                  )}
                  <p className="text-xs text-text-muted font-mono truncate">
                    {user.did}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border bg-surface-hover">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded">esc</kbd>
              to close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
