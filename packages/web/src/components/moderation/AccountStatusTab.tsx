'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AppealModal } from './AppealModal';

interface Sanction {
  id: string;
  type: string;
  reason: string;
  expiresAt?: string;
  appealStatus?: string;
  createdAt: string;
  canAppeal?: boolean;
}

interface Appeal {
  id: string;
  sanctionId?: string;
  sanction?: { type: string; reason: string };
  reason: string;
  additionalInfo?: string;
  status: string;
  decision?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  submittedAt: string;
}

interface AccountStatusData {
  accountStanding: 'good' | 'warning' | 'restricted';
  activeSanctions: Sanction[];
  sanctionHistory: Sanction[];
}

interface AppealsData {
  appeals: Appeal[];
  cursor?: string;
}

const SANCTION_TYPE_LABELS: Record<string, { label: string; severity: 'low' | 'medium' | 'high' }> = {
  warning: { label: 'Warning', severity: 'low' },
  mute: { label: 'Temporary Mute', severity: 'medium' },
  suspend: { label: 'Account Suspended', severity: 'high' },
  ban: { label: 'Account Banned', severity: 'high' },
};

const STANDING_STYLES: Record<string, { icon: React.FC<{ className?: string }>; bg: string; text: string; border: string }> = {
  good: {
    icon: CheckCircleIcon,
    bg: 'bg-green-500/10',
    text: 'text-green-500',
    border: 'border-green-500/20',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-500',
    border: 'border-yellow-500/20',
  },
  restricted: {
    icon: XCircleIcon,
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    border: 'border-red-500/20',
  },
};

const APPEAL_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Pending' },
  reviewing: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Under Review' },
  approved: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Approved' },
  denied: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Denied' },
};

interface AccountStatusTabProps {
  showAppealsOnly?: boolean;
}

export function AccountStatusTab({ showAppealsOnly = false }: AccountStatusTabProps) {
  const [appealingSanctionId, setAppealingSanctionId] = useState<string | null>(null);

  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['account-status'],
    queryFn: () => api.getUserAccountStatus(),
    enabled: !showAppealsOnly,
  });

  const { data: appealsData, isLoading: appealsLoading, refetch: refetchAppeals } = useQuery({
    queryKey: ['my-appeals'],
    queryFn: () => api.getUserAppeals(),
    enabled: showAppealsOnly,
  });

  const accountStatus = statusData as AccountStatusData | undefined;
  const appeals = (appealsData as AppealsData | undefined)?.appeals || [];

  if ((showAppealsOnly && appealsLoading) || (!showAppealsOnly && statusLoading)) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (showAppealsOnly) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text-primary">Your Appeals</h2>

        {appeals.length === 0 ? (
          <EmptyAppealsState />
        ) : (
          <div className="space-y-4">
            {appeals.map((appeal) => (
              <AppealCard key={appeal.id} appeal={appeal} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const standing = STANDING_STYLES[accountStatus?.accountStanding || 'good'];
  const StandingIcon = standing.icon;

  return (
    <div className="space-y-6">
      {/* Account Standing Banner */}
      <div
        className={cn(
          'rounded-lg border p-4',
          standing.bg,
          standing.border
        )}
      >
        <div className="flex items-center gap-3">
          <StandingIcon className={cn('w-8 h-8', standing.text)} />
          <div>
            <h2 className={cn('text-lg font-semibold', standing.text)}>
              {accountStatus?.accountStanding === 'good'
                ? 'Your account is in good standing'
                : accountStatus?.accountStanding === 'warning'
                ? 'Your account has a warning'
                : 'Your account has restrictions'}
            </h2>
            <p className="text-sm text-text-muted">
              {accountStatus?.accountStanding === 'good'
                ? 'No active warnings or restrictions on your account.'
                : 'Review the details below to understand the status of your account.'}
            </p>
          </div>
        </div>
      </div>

      {/* Active Sanctions */}
      {accountStatus?.activeSanctions && accountStatus.activeSanctions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Active Restrictions</h3>
          {accountStatus.activeSanctions.map((sanction) => (
            <SanctionCard
              key={sanction.id}
              sanction={sanction}
              isActive
              onAppeal={() => setAppealingSanctionId(sanction.id)}
            />
          ))}
        </div>
      )}

      {/* Sanction History */}
      {accountStatus?.sanctionHistory && accountStatus.sanctionHistory.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">History</h3>
          <p className="text-sm text-text-muted">Past warnings and restrictions (last 90 days)</p>
          {accountStatus.sanctionHistory.map((sanction) => (
            <SanctionCard
              key={sanction.id}
              sanction={sanction}
              isActive={false}
            />
          ))}
        </div>
      )}

      {/* Appeal Modal */}
      {appealingSanctionId && (
        <AppealModal
          sanctionId={appealingSanctionId}
          onClose={() => setAppealingSanctionId(null)}
          onSuccess={() => {
            setAppealingSanctionId(null);
            refetchStatus();
            refetchAppeals();
          }}
        />
      )}
    </div>
  );
}

function SanctionCard({
  sanction,
  isActive,
  onAppeal,
}: {
  sanction: Sanction;
  isActive: boolean;
  onAppeal?: () => void;
}) {
  const typeInfo = SANCTION_TYPE_LABELS[sanction.type] || { label: sanction.type, severity: 'medium' };
  const severityColors = {
    low: 'border-yellow-500/20 bg-yellow-500/5',
    medium: 'border-orange-500/20 bg-orange-500/5',
    high: 'border-red-500/20 bg-red-500/5',
  };

  const expiresAt = sanction.expiresAt ? new Date(sanction.expiresAt) : null;
  const isPermanent = !expiresAt;
  const isExpired = expiresAt && expiresAt < new Date();

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isActive ? severityColors[typeInfo.severity] : 'bg-surface border-border'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              'font-medium',
              isActive ? 'text-text-primary' : 'text-text-secondary'
            )}>
              {typeInfo.label}
            </span>
            {sanction.appealStatus && (
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  APPEAL_STATUS_STYLES[sanction.appealStatus]?.bg,
                  APPEAL_STATUS_STYLES[sanction.appealStatus]?.text
                )}
              >
                Appeal {APPEAL_STATUS_STYLES[sanction.appealStatus]?.label}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-text-secondary">{sanction.reason}</p>

          <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
            <span>Issued {formatDate(sanction.createdAt)}</span>
            {expiresAt && !isExpired && (
              <>
                <span>•</span>
                <span>Expires {formatDate(sanction.expiresAt!)}</span>
              </>
            )}
            {isExpired && (
              <>
                <span>•</span>
                <span>Expired</span>
              </>
            )}
            {isPermanent && isActive && (
              <>
                <span>•</span>
                <span className="text-red-500">Permanent</span>
              </>
            )}
          </div>
        </div>

        {isActive && sanction.canAppeal && onAppeal && (
          <button
            onClick={onAppeal}
            className="px-3 py-1.5 text-sm font-medium text-accent bg-accent/10 hover:bg-accent/20 rounded-lg transition-colors"
          >
            Appeal
          </button>
        )}
      </div>
    </div>
  );
}

function AppealCard({ appeal }: { appeal: Appeal }) {
  const status = APPEAL_STATUS_STYLES[appeal.status] || APPEAL_STATUS_STYLES.pending;

  return (
    <div className="bg-surface rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {appeal.sanction && (
            <div className="text-xs text-text-muted mb-1">
              Appeal for: {SANCTION_TYPE_LABELS[appeal.sanction.type]?.label || appeal.sanction.type}
            </div>
          )}

          <p className="text-sm text-text-secondary line-clamp-2">{appeal.reason}</p>

          <div className="mt-2 text-xs text-text-muted">
            Submitted {formatDate(appeal.submittedAt)}
            {appeal.reviewedAt && ` • Reviewed ${formatDate(appeal.reviewedAt)}`}
          </div>

          {appeal.decision && (
            <div className="mt-2 p-2 bg-background rounded text-sm">
              <span className="font-medium">Decision: </span>
              {appeal.decision}
            </div>
          )}
        </div>

        <span
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium',
            status.bg,
            status.text
          )}
        >
          {status.label}
        </span>
      </div>
    </div>
  );
}

function EmptyAppealsState() {
  return (
    <div className="text-center py-12 bg-surface rounded-lg border border-border">
      <ScaleIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
      <h3 className="text-lg font-medium text-text-primary mb-2">No appeals submitted</h3>
      <p className="text-text-muted text-sm max-w-md mx-auto">
        If you receive a sanction that you believe was issued in error, you can submit an
        appeal from the Account Status tab.
      </p>
    </div>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ExclamationTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
    </svg>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
