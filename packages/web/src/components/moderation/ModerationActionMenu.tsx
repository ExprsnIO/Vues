'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface ModerationActionMenuProps {
  videoUri: string;
  videoCid: string;
}

type ModerationAction = 'approve' | 'remove' | 'flag' | 'warn';

const ACTIONS: Array<{
  key: ModerationAction;
  label: string;
  description: string;
  colorClass: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'approve',
    label: 'Approve',
    description: 'Mark as reviewed and approved',
    colorClass: 'text-green-400 hover:bg-green-400/10',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
  },
  {
    key: 'remove',
    label: 'Remove Content',
    description: 'Remove this video from the platform',
    colorClass: 'text-red-400 hover:bg-red-400/10',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    ),
  },
  {
    key: 'flag',
    label: 'Flag for Review',
    description: 'Escalate to senior moderator',
    colorClass: 'text-orange-400 hover:bg-orange-400/10',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
  },
  {
    key: 'warn',
    label: 'Warn Creator',
    description: 'Send a warning to the video creator',
    colorClass: 'text-yellow-400 hover:bg-yellow-400/10',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
];

export function ModerationActionMenu({ videoUri, videoCid }: ModerationActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setPendingAction(null);
        setReason('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const actionMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: ModerationAction; reason: string }) => {
      if (action === 'approve') {
        // Approve: restore content (clear any removal flag)
        await api.restoreAdminContent({ uri: videoUri, reason: 'approved by moderator' });
        return { action };
      }
      if (action === 'remove') {
        await api.removeAdminContent({ uri: videoUri, reason });
        return { action };
      }
      if (action === 'flag') {
        // Flag for review: escalate via the standard report pathway
        await api.report({
          subjectUri: videoUri,
          subjectCid: videoCid,
          reason: 'other',
          description: `[Moderator escalation] ${reason}`,
        });
        return { action };
      }
      if (action === 'warn') {
        // Warn creator: send a moderator-originated warning report
        await api.report({
          subjectUri: videoUri,
          subjectCid: videoCid,
          reason: 'other',
          description: `[Moderator warn creator] ${reason}`,
        });
        return { action };
      }
    },
    onSuccess: (data) => {
      const messages: Record<ModerationAction, string> = {
        approve: 'Content approved',
        remove: 'Content removed',
        flag: 'Flagged for review',
        warn: 'Warning sent to creator',
      };
      toast.success(messages[data!.action as ModerationAction]);
      setIsOpen(false);
      setPendingAction(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Moderation action failed');
    },
  });

  const handleActionClick = useCallback((action: ModerationAction) => {
    if (action === 'approve') {
      // Approve needs no reason confirmation
      actionMutation.mutate({ action, reason: 'approved' });
      return;
    }
    setPendingAction(action);
  }, [actionMutation]);

  const handleConfirm = useCallback(() => {
    if (!pendingAction || !reason.trim()) return;
    actionMutation.mutate({ action: pendingAction, reason: reason.trim() });
  }, [pendingAction, reason, actionMutation]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setPendingAction(null);
          setReason('');
        }}
        className="flex flex-col items-center"
        title="Moderation actions"
      >
        <div className="p-2 rounded-full text-orange-400 hover:text-orange-300 transition-colors">
          <ShieldIcon className="w-7 h-7" />
        </div>
        <span className="text-xs text-orange-400 font-medium">Moderate</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-60 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden z-50">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
            <ShieldIcon className="w-4 h-4 text-orange-400" />
            <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">
              Moderation
            </span>
          </div>

          {pendingAction ? (
            /* Reason confirmation panel */
            <div className="p-3 space-y-3">
              <p className="text-sm text-gray-300">
                {ACTIONS.find((a) => a.key === pendingAction)?.description}
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (required)"
                rows={2}
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-orange-400"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setPendingAction(null);
                    setReason('');
                  }}
                  className="flex-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!reason.trim() || actionMutation.isPending}
                  className="flex-1 px-3 py-1.5 text-sm bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
                >
                  {actionMutation.isPending ? 'Applying...' : 'Confirm'}
                </button>
              </div>
            </div>
          ) : (
            /* Action list */
            <div className="py-1">
              {ACTIONS.map((action) => (
                <button
                  key={action.key}
                  onClick={() => handleActionClick(action.key)}
                  disabled={actionMutation.isPending}
                  className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition-colors ${action.colorClass}`}
                >
                  {action.icon}
                  <div>
                    <div className="text-sm font-medium">{action.label}</div>
                    <div className="text-xs opacity-70">{action.description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}
