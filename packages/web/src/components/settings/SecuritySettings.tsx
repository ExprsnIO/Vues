'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Session {
  id: string;
  deviceName: string;
  browser: string;
  location?: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

interface LoginHistoryEntry {
  id: string;
  deviceName: string;
  browser: string;
  location?: string;
  ipAddress?: string;
  timestamp: string;
  success: boolean;
}

export function SecuritySettings() {
  const queryClient = useQueryClient();
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null);
  const [showRevokeAllConfirm, setShowRevokeAllConfirm] = useState(false);

  // Fetch active sessions
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      // This would call api.getSessions() when implemented
      // For now, return mock data structure
      if ('getSessions' in api && typeof (api as Record<string, unknown>).getSessions === 'function') {
        return (api as unknown as { getSessions: () => Promise<{ sessions: Session[] }> }).getSessions();
      }
      return { sessions: [] as Session[] };
    },
  });

  // Fetch login history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['loginHistory'],
    queryFn: async () => {
      if ('getLoginHistory' in api && typeof (api as Record<string, unknown>).getLoginHistory === 'function') {
        return (api as unknown as { getLoginHistory: () => Promise<{ history: LoginHistoryEntry[] }> }).getLoginHistory();
      }
      return { history: [] as LoginHistoryEntry[] };
    },
  });

  // Revoke session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if ('revokeSession' in api && typeof (api as Record<string, unknown>).revokeSession === 'function') {
        return (api as unknown as { revokeSession: (id: string) => Promise<{ success: boolean }> }).revokeSession(sessionId);
      }
      throw new Error('Not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setShowRevokeConfirm(null);
      toast.success('Session revoked');
    },
    onError: () => {
      toast.error('Failed to revoke session');
    },
  });

  // Revoke all other sessions mutation
  const revokeAllMutation = useMutation({
    mutationFn: async () => {
      if ('revokeAllSessions' in api && typeof (api as Record<string, unknown>).revokeAllSessions === 'function') {
        return (api as unknown as { revokeAllSessions: () => Promise<{ success: boolean }> }).revokeAllSessions();
      }
      throw new Error('Not implemented');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setShowRevokeAllConfirm(false);
      toast.success('All other sessions revoked');
    },
    onError: () => {
      toast.error('Failed to revoke sessions');
    },
  });

  const sessions = sessionsData?.sessions || [];
  const history = historyData?.history || [];
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <div className="space-y-6">
      {/* Active Sessions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-medium text-text-primary">Active Sessions</h3>
            <p className="text-sm text-text-muted">Manage devices where you're signed in</p>
          </div>
          {otherSessions.length > 0 && (
            <button
              onClick={() => setShowRevokeAllConfirm(true)}
              className="text-sm text-red-500 hover:text-red-600 font-medium"
            >
              Sign out all others
            </button>
          )}
        </div>

        {sessionsLoading ? (
          <div className="bg-surface rounded-xl p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-12 bg-background rounded-lg" />
              <div className="h-12 bg-background rounded-lg" />
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-surface rounded-xl p-6 text-center">
            <DeviceIcon className="w-10 h-10 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No active sessions found</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl divide-y divide-border overflow-hidden">
            {sessions.map((session) => (
              <div key={session.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                    {session.browser.toLowerCase().includes('mobile') ? (
                      <MobileIcon className="w-5 h-5 text-text-muted" />
                    ) : (
                      <DesktopIcon className="w-5 h-5 text-text-muted" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-medium">{session.deviceName}</span>
                      {session.isCurrent && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-500 rounded-full">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-muted">
                      {session.browser} {session.location && `· ${session.location}`}
                    </p>
                    <p className="text-xs text-text-muted">
                      Last active: {new Date(session.lastActive).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <button
                    onClick={() => setShowRevokeConfirm(session.id)}
                    className="text-sm text-red-500 hover:text-red-600 font-medium px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Login History */}
      <div>
        <div className="mb-4">
          <h3 className="text-base font-medium text-text-primary">Login History</h3>
          <p className="text-sm text-text-muted">Recent sign-in activity on your account</p>
        </div>

        {historyLoading ? (
          <div className="bg-surface rounded-xl p-4">
            <div className="animate-pulse space-y-3">
              <div className="h-10 bg-background rounded-lg" />
              <div className="h-10 bg-background rounded-lg" />
              <div className="h-10 bg-background rounded-lg" />
            </div>
          </div>
        ) : history.length === 0 ? (
          <div className="bg-surface rounded-xl p-6 text-center">
            <HistoryIcon className="w-10 h-10 text-text-muted mx-auto mb-2" />
            <p className="text-text-muted text-sm">No login history available</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl divide-y divide-border overflow-hidden">
            {history.slice(0, 10).map((entry) => (
              <div key={entry.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    entry.success ? 'bg-green-500/10' : 'bg-red-500/10'
                  }`}>
                    {entry.success ? (
                      <CheckIcon className="w-4 h-4 text-green-500" />
                    ) : (
                      <XIcon className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary text-sm">{entry.deviceName}</span>
                      <span className="text-text-muted text-sm">· {entry.browser}</span>
                    </div>
                    <p className="text-xs text-text-muted">
                      {entry.location && `${entry.location} · `}
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-medium ${entry.success ? 'text-green-500' : 'text-red-500'}`}>
                  {entry.success ? 'Success' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revoke Single Session Confirm */}
      {showRevokeConfirm && (
        <ConfirmModal
          title="Sign out device?"
          description="This will sign out the selected device. You'll need to sign in again on that device."
          confirmLabel="Sign out"
          confirmColor="bg-red-500 hover:bg-red-600"
          isLoading={revokeSessionMutation.isPending}
          onClose={() => setShowRevokeConfirm(null)}
          onConfirm={() => revokeSessionMutation.mutate(showRevokeConfirm)}
        />
      )}

      {/* Revoke All Sessions Confirm */}
      {showRevokeAllConfirm && (
        <ConfirmModal
          title="Sign out all other devices?"
          description="This will sign out all devices except the current one. You'll need to sign in again on those devices."
          confirmLabel="Sign out all"
          confirmColor="bg-red-500 hover:bg-red-600"
          isLoading={revokeAllMutation.isPending}
          onClose={() => setShowRevokeAllConfirm(false)}
          onConfirm={() => revokeAllMutation.mutate()}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmColor,
  isLoading,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmColor: string;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
        <p className="text-text-muted text-sm mb-6">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2 bg-surface hover:bg-surface-hover text-text-primary rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${confirmColor}`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function DesktopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function MobileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
