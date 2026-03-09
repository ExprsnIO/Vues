'use client';

import { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-hover text-text-secondary',
  success: 'bg-green-500/10 text-green-500',
  warning: 'bg-yellow-500/10 text-yellow-500',
  error: 'bg-red-500/10 text-red-500',
  info: 'bg-blue-500/10 text-blue-500',
  purple: 'bg-purple-500/10 text-purple-500',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
  lg: 'text-sm px-2.5 py-1',
};

const dotSizeStyles: Record<BadgeSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {dot && (
        <span
          className={`rounded-full ${dotSizeStyles[size]} ${
            variant === 'default' ? 'bg-text-muted' : 'bg-current'
          }`}
        />
      )}
      {children}
    </span>
  );
}

// Preset badges for common statuses
export function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: BadgeVariant; label: string }> = {
    active: { variant: 'success', label: 'Active' },
    pending: { variant: 'warning', label: 'Pending' },
    verifying: { variant: 'info', label: 'Verifying' },
    suspended: { variant: 'error', label: 'Suspended' },
    inactive: { variant: 'default', label: 'Inactive' },
    banned: { variant: 'error', label: 'Banned' },
    muted: { variant: 'warning', label: 'Muted' },
    warning: { variant: 'warning', label: 'Warning' },
    approved: { variant: 'success', label: 'Approved' },
    rejected: { variant: 'error', label: 'Rejected' },
    reviewing: { variant: 'info', label: 'Reviewing' },
    live: { variant: 'error', label: 'Live' },
    scheduled: { variant: 'info', label: 'Scheduled' },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'error', label: 'Failed' },
    processing: { variant: 'info', label: 'Processing' },
    queued: { variant: 'default', label: 'Queued' },
  };

  const config = statusConfig[status.toLowerCase()] || {
    variant: 'default' as BadgeVariant,
    label: status,
  };

  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const roleConfig: Record<string, { variant: BadgeVariant; label: string }> = {
    admin: { variant: 'purple', label: 'Admin' },
    moderator: { variant: 'info', label: 'Moderator' },
    member: { variant: 'default', label: 'Member' },
    owner: { variant: 'warning', label: 'Owner' },
    viewer: { variant: 'default', label: 'Viewer' },
  };

  const config = roleConfig[role.toLowerCase()] || {
    variant: 'default' as BadgeVariant,
    label: role,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
