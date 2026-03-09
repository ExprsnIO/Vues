'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface AddUserModalProps {
  domainId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SearchResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export function AddUserModal({ domainId, isOpen, onClose, onSuccess }: AddUserModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [role, setRole] = useState<'admin' | 'moderator' | 'member'>('member');
  const [isSearching, setIsSearching] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.searchUsers(searchQuery, { limit: 10 });
        setSearchResults(results.users || []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addMutation = useMutation({
    mutationFn: () =>
      api.adminDomainsUsersAdd({
        domainId,
        userDid: selectedUser!.did,
        role,
      }),
    onSuccess: () => {
      toast.success('User added to domain');
      onSuccess();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add user');
    },
  });

  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedUser(null);
    setRole('member');
    onClose();
  }, [onClose]);

  const handleSubmit = () => {
    if (!selectedUser) return;
    addMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm\" onClick={handleClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Add User to Domain</h2>
          <p className="text-sm text-text-muted mt-1">Search for a user and assign them a role</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* User Search */}
          {!selectedUser ? (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">
                Search User
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter handle or DID..."
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                autoFocus
              />

              {/* Search Results */}
              {isSearching && (
                <div className="mt-2 text-sm text-text-muted">Searching...</div>
              )}
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {searchResults.map((user) => (
                    <button
                      key={user.did}
                      onClick={() => {
                        setSelectedUser(user);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                            {user.handle?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">
                          {user.displayName || user.handle}
                        </p>
                        <p className="text-sm text-text-muted truncate">@{user.handle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">
                Selected User
              </label>
              <div className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg">
                <div className="w-10 h-10 rounded-full bg-surface-hover overflow-hidden flex-shrink-0">
                  {selectedUser.avatar ? (
                    <img src={selectedUser.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted font-semibold">
                      {selectedUser.handle?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary truncate">
                    {selectedUser.displayName || selectedUser.handle}
                  </p>
                  <p className="text-sm text-text-muted truncate">@{selectedUser.handle}</p>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-2 py-1 text-sm text-text-muted hover:text-text-primary transition-colors"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'moderator' | 'member')}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="member">Member</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
            <p className="mt-1 text-xs text-text-muted">
              {role === 'admin' && 'Full access to domain settings and user management'}
              {role === 'moderator' && 'Can moderate content and manage reports'}
              {role === 'member' && 'Basic access to domain features'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedUser || addMutation.isPending}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {addMutation.isPending ? 'Adding...' : 'Add User'}
          </button>
        </div>
      </div>
    </div>
  );
}
