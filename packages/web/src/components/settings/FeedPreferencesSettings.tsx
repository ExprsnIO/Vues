'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface FeedPreferences {
  interests: string[];
  hiddenAuthors: Array<{ did: string; handle: string; hiddenAt: string }>;
  blockedTags: string[];
  feedbackCount: number;
}

export function FeedPreferencesSettings() {
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['feed', 'preferences'],
    queryFn: () => api.getFeedPreferences(),
  });

  const removeInterest = useMutation({
    mutationFn: (tag: string) => api.removeInterest(tag),
    onSuccess: (_data, tag) => {
      queryClient.setQueryData<FeedPreferences>(['feed', 'preferences'], (prev) => {
        if (!prev) return prev;
        return { ...prev, interests: prev.interests.filter((t) => t !== tag) };
      });
      toast.success(`Removed #${tag} from your interests`);
    },
    onError: () => {
      toast.error('Failed to remove interest');
    },
  });

  const unhideAuthor = useMutation({
    mutationFn: (did: string) => api.unhideAuthor(did),
    onSuccess: (_data, did) => {
      queryClient.setQueryData<FeedPreferences>(['feed', 'preferences'], (prev) => {
        if (!prev) return prev;
        return { ...prev, hiddenAuthors: prev.hiddenAuthors.filter((a) => a.did !== did) };
      });
      toast.success('Creator unhidden');
    },
    onError: () => {
      toast.error('Failed to unhide creator');
    },
  });

  const unblockTag = useMutation({
    mutationFn: (tag: string) =>
      api.removeFeedback({ targetType: 'tag', targetId: tag }),
    onSuccess: (_data, tag) => {
      queryClient.setQueryData<FeedPreferences>(['feed', 'preferences'], (prev) => {
        if (!prev) return prev;
        return { ...prev, blockedTags: prev.blockedTags.filter((t) => t !== tag) };
      });
      toast.success(`Unblocked #${tag}`);
    },
    onError: () => {
      toast.error('Failed to unblock tag');
    },
  });

  const resetFeed = useMutation({
    mutationFn: () => api.resetFeedPreferences(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed', 'preferences'] });
      setConfirmReset(false);
      toast.success('Feed preferences reset');
    },
    onError: () => {
      toast.error('Failed to reset feed preferences');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 bg-surface rounded-lg" />
        <div className="h-24 bg-surface rounded-lg" />
        <div className="h-16 bg-surface rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Interests */}
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">Your Interests</h3>
        <p className="text-xs text-text-muted mb-3">
          Topics the algorithm uses to personalize your feed
        </p>
        {prefs?.feedbackCount !== undefined && (
          <p className="text-xs text-text-muted mb-3">
            Based on {prefs.feedbackCount.toLocaleString()} interaction{prefs.feedbackCount !== 1 ? 's' : ''}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {prefs?.interests && prefs.interests.length > 0 ? (
            prefs.interests.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border rounded-full text-xs text-text-secondary"
              >
                #{tag}
                <button
                  onClick={() => removeInterest.mutate(tag)}
                  disabled={removeInterest.isPending}
                  className="text-text-muted hover:text-error transition-colors leading-none ml-0.5"
                  aria-label={`Remove ${tag} from interests`}
                >
                  <XSmallIcon />
                </button>
              </span>
            ))
          ) : (
            <p className="text-xs text-text-muted">
              No interests detected yet. Keep watching to train your feed.
            </p>
          )}
        </div>
      </div>

      {/* Hidden creators */}
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">Hidden Creators</h3>
        <p className="text-xs text-text-muted mb-3">
          Creators you've marked "Not Interested" in
        </p>
        {prefs?.hiddenAuthors && prefs.hiddenAuthors.length > 0 ? (
          <div className="bg-surface rounded-xl divide-y divide-border overflow-hidden">
            {prefs.hiddenAuthors.map((author) => (
              <div key={author.did} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-text-secondary">@{author.handle}</span>
                <button
                  onClick={() => unhideAuthor.mutate(author.did)}
                  disabled={unhideAuthor.isPending}
                  className="text-xs text-accent hover:underline disabled:opacity-50"
                >
                  Unhide
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No hidden creators</p>
        )}
      </div>

      {/* Blocked tags */}
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">Blocked Tags</h3>
        <p className="text-xs text-text-muted mb-3">Tags you've muted from your feed</p>
        {prefs?.blockedTags && prefs.blockedTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {prefs.blockedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border rounded-full text-xs text-text-secondary"
              >
                #{tag}
                <button
                  onClick={() => unblockTag.mutate(tag)}
                  disabled={unblockTag.isPending}
                  className="text-text-muted hover:text-error transition-colors leading-none ml-0.5"
                  aria-label={`Unblock ${tag}`}
                >
                  <XSmallIcon />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No blocked tags</p>
        )}
      </div>

      {/* Reset */}
      <div className="pt-4 border-t border-border">
        {confirmReset ? (
          <div className="space-y-3">
            <p className="text-sm text-text-primary font-medium">
              Reset all feed preferences?
            </p>
            <p className="text-xs text-text-muted">
              This will clear all interests, hidden creators, and blocked tags. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmReset(false)}
                className="px-4 py-2 text-sm bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => resetFeed.mutate()}
                disabled={resetFeed.isPending}
                className="px-4 py-2 text-sm bg-error/10 hover:bg-error/20 text-error rounded-lg transition-colors disabled:opacity-50"
              >
                {resetFeed.isPending ? 'Resetting...' : 'Reset preferences'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setConfirmReset(true)}
              className="text-sm text-error hover:underline"
            >
              Reset all feed preferences
            </button>
            <p className="text-xs text-text-muted mt-1">
              Clears all interests, hidden creators, and blocked tags. Your feed will start fresh.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function XSmallIcon() {
  return (
    <svg
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
