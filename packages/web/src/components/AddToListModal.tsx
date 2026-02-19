'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

interface AddToListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userDid: string;
  userHandle: string;
}

export function AddToListModal({
  isOpen,
  onClose,
  userDid,
  userHandle,
}: AddToListModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [processingListUri, setProcessingListUri] = useState<string | null>(null);

  // Fetch user's lists
  const { data: listsData, isLoading } = useQuery({
    queryKey: ['lists', user?.did],
    queryFn: () => api.getLists(user!.did),
    enabled: isOpen && !!user,
  });

  // Fetch which lists the target user is in
  const { data: membershipData } = useQuery({
    queryKey: ['list-memberships', userDid],
    queryFn: () => api.getListMemberships(userDid),
    enabled: isOpen && !!user,
  });

  const addToListMutation = useMutation({
    mutationFn: ({ listUri }: { listUri: string }) =>
      api.addListItem(listUri, userDid),
    onSuccess: (_, { listUri }) => {
      queryClient.invalidateQueries({ queryKey: ['list-memberships', userDid] });
      queryClient.invalidateQueries({ queryKey: ['list', listUri] });
      toast.success(`Added @${userHandle} to list`);
      setProcessingListUri(null);
    },
    onError: () => {
      toast.error('Failed to add to list');
      setProcessingListUri(null);
    },
  });

  const removeFromListMutation = useMutation({
    mutationFn: ({ listUri }: { listUri: string }) =>
      api.removeListItem(listUri, userDid),
    onSuccess: (_, { listUri }) => {
      queryClient.invalidateQueries({ queryKey: ['list-memberships', userDid] });
      queryClient.invalidateQueries({ queryKey: ['list', listUri] });
      toast.success(`Removed @${userHandle} from list`);
      setProcessingListUri(null);
    },
    onError: () => {
      toast.error('Failed to remove from list');
      setProcessingListUri(null);
    },
  });

  if (!isOpen) return null;

  const lists = listsData?.lists ?? [];
  const memberships = new Set(membershipData?.lists?.map((l) => l.uri) ?? []);

  const handleToggleList = (listUri: string) => {
    setProcessingListUri(listUri);
    if (memberships.has(listUri)) {
      removeFromListMutation.mutate({ listUri });
    } else {
      addToListMutation.mutate({ listUri });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Add to List</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded-lg transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-8 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : lists.length === 0 ? (
            <div className="p-8 text-center">
              <ListIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium mb-2">No lists yet</p>
              <p className="text-text-muted text-sm mb-4">
                Create a list to organize accounts.
              </p>
              <Link
                href="/lists/create"
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                Create List
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {lists.map((list) => {
                const isInList = memberships.has(list.uri);
                const isProcessing = processingListUri === list.uri;

                return (
                  <button
                    key={list.uri}
                    onClick={() => handleToggleList(list.uri)}
                    disabled={isProcessing}
                    className="w-full flex items-center gap-4 p-4 hover:bg-surface transition-colors disabled:opacity-50"
                  >
                    {/* List icon */}
                    <div className="w-10 h-10 rounded-lg bg-surface overflow-hidden flex-shrink-0">
                      {list.avatar ? (
                        <img
                          src={list.avatar}
                          alt={list.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-accent/20">
                          <ListIcon className="w-5 h-5 text-accent" />
                        </div>
                      )}
                    </div>

                    {/* List info */}
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-medium text-text-primary truncate">
                        {list.name}
                      </p>
                      <p className="text-sm text-text-muted">
                        {list.memberCount} members
                      </p>
                    </div>

                    {/* Checkbox */}
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                      isInList
                        ? 'bg-accent border-accent'
                        : 'border-border'
                    }`}>
                      {isProcessing ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : isInList ? (
                        <CheckIcon className="w-4 h-4 text-white" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {lists.length > 0 && (
          <div className="p-4 border-t border-border">
            <Link
              href="/lists/create"
              className="flex items-center justify-center gap-2 w-full py-2.5 border border-border text-text-primary hover:bg-surface rounded-lg text-sm font-medium transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Create New List
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
