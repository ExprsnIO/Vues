'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface UserActionsMenuProps {
  userDid: string;
  userHandle: string;
  viewer?: {
    blocking?: boolean;
    blockUri?: string;
    muting?: boolean;
    muteUri?: string;
  };
  onActionComplete?: () => void;
}

export function UserActionsMenu({
  userDid,
  userHandle,
  viewer,
  onActionComplete,
}: UserActionsMenuProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (viewer?.blocking && viewer.blockUri) {
        return api.unblock(viewer.blockUri);
      } else {
        return api.block(userDid);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userHandle] });
      queryClient.invalidateQueries({ queryKey: ['blocks'] });
      setIsOpen(false);
      onActionComplete?.();
    },
  });

  const muteMutation = useMutation({
    mutationFn: async () => {
      if (viewer?.muting && viewer.muteUri) {
        return api.unmute(viewer.muteUri);
      } else {
        return api.mute(userDid);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userHandle] });
      queryClient.invalidateQueries({ queryKey: ['mutes'] });
      setIsOpen(false);
      onActionComplete?.();
    },
  });

  const handleReport = () => {
    // TODO: Open report modal
    setIsOpen(false);
  };

  // Don't show if not logged in or viewing own profile
  if (!user || user.did === userDid) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full hover:bg-surface transition-colors"
        aria-label="More actions"
      >
        <MoreIcon className="w-5 h-5 text-text-primary" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Block/Unblock */}
          <button
            onClick={() => blockMutation.mutate()}
            disabled={blockMutation.isPending}
            className="w-full px-4 py-3 text-left hover:bg-surface transition-colors flex items-center gap-3"
          >
            <BlockIcon className="w-5 h-5 text-text-muted" />
            <span className={viewer?.blocking ? 'text-accent' : 'text-text-primary'}>
              {blockMutation.isPending
                ? 'Loading...'
                : viewer?.blocking
                  ? 'Unblock'
                  : 'Block'}
            </span>
          </button>

          {/* Mute/Unmute */}
          <button
            onClick={() => muteMutation.mutate()}
            disabled={muteMutation.isPending}
            className="w-full px-4 py-3 text-left hover:bg-surface transition-colors flex items-center gap-3"
          >
            <MuteIcon className="w-5 h-5 text-text-muted" />
            <span className={viewer?.muting ? 'text-accent' : 'text-text-primary'}>
              {muteMutation.isPending
                ? 'Loading...'
                : viewer?.muting
                  ? 'Unmute'
                  : 'Mute'}
            </span>
          </button>

          <div className="border-t border-border" />

          {/* Report */}
          <button
            onClick={handleReport}
            className="w-full px-4 py-3 text-left hover:bg-surface transition-colors flex items-center gap-3"
          >
            <ReportIcon className="w-5 h-5 text-red-500" />
            <span className="text-red-500">Report</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
      />
    </svg>
  );
}

function BlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  );
}

function MuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V17.44a.75.75 0 01-1.28.53L6.75 13.5H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
      />
    </svg>
  );
}

function ReportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
      />
    </svg>
  );
}
