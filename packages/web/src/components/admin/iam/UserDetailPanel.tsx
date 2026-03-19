'use client';

import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EffectivePermissions } from '@/components/admin/permissions/EffectivePermissions';

interface UserDetailPanelProps {
  domainId: string;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface UserAccessData {
  access: {
    domainId: string;
    userDid: string;
    source: 'domain' | 'global_inherited';
    directPermissions: string[];
    assignedRoles: Array<{
      id: string;
      name: string;
      displayName?: string;
      description?: string;
      isSystem: boolean;
      priority: number;
      permissions: string[];
    }>;
    groups: Array<{
      id: string;
      name: string;
      directPermissions: string[];
      assignedRoles: Array<{
        id: string;
        name: string;
        displayName?: string;
        isSystem: boolean;
        priority: number;
        permissions: string[];
      }>;
    }>;
    effectivePermissions: string[];
  };
}

interface AdminUserData {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  email?: string;
  createdAt?: string;
  status?: string;
  isSuspended?: boolean;
  isBanned?: boolean;
}

export function UserDetailPanel({
  domainId,
  userId,
  isOpen,
  onClose,
}: UserDetailPanelProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.getAdminUser(userId),
    enabled: isOpen && !!userId,
  });

  const { data: accessData, isLoading: accessLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'users', userId, 'access'],
    queryFn: () => api.adminDomainUsersAccess(domainId, userId),
    enabled: isOpen && !!domainId && !!userId,
  });

  const { data: catalogData } = useQuery({
    queryKey: ['admin', 'domain', 'permissions', 'catalog'],
    queryFn: () => api.adminDomainPermissionsCatalog(),
    staleTime: 5 * 60 * 1000,
    enabled: isOpen,
  });

  const user = userData as AdminUserData | undefined;
  const access = (accessData as UserAccessData | undefined)?.access;

  const isLoading = userLoading || accessLoading;

  const userStatus = user?.isBanned
    ? 'banned'
    : user?.isSuspended
    ? 'suspended'
    : 'active';

  const statusColors = {
    active: 'bg-green-500/10 text-green-500',
    suspended: 'bg-yellow-500/10 text-yellow-500',
    banned: 'bg-red-500/10 text-red-500',
  };

  const domainUserStatus = access?.source === 'global_inherited' ? 'inherited' : undefined;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="User details"
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-surface border-l border-border shadow-2xl',
          'flex flex-col transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="font-semibold text-text-primary">User Details</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            aria-label="Close panel"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-surface-hover" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-surface-hover rounded w-1/2" />
                  <div className="h-4 bg-surface-hover rounded w-1/3" />
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-4 bg-surface-hover rounded" />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* User identity */}
              <div className="flex items-start gap-4">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.displayName || user.handle}
                    className="w-16 h-16 rounded-full object-cover border border-border flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-surface-hover border border-border flex items-center justify-center flex-shrink-0">
                    <UserCircleIcon className="w-10 h-10 text-text-muted" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-text-primary text-lg leading-tight">
                      {user?.displayName || user?.handle || userId}
                    </h3>
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full font-medium',
                        statusColors[userStatus]
                      )}
                    >
                      {userStatus}
                    </span>
                    {domainUserStatus && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-surface-hover text-text-muted border border-border">
                        {domainUserStatus}
                      </span>
                    )}
                  </div>
                  {user?.handle && (
                    <p className="text-sm text-text-muted mt-0.5">@{user.handle}</p>
                  )}
                </div>
              </div>

              {/* Identity info */}
              <div className="bg-surface-hover/50 rounded-xl p-4 space-y-2.5">
                <InfoRow label="DID" value={userId} mono />
                {user?.email && <InfoRow label="Email" value={user.email} />}
                {user?.createdAt && (
                  <InfoRow
                    label="Joined"
                    value={new Date(user.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  />
                )}
                {access?.source && (
                  <InfoRow
                    label="Access Source"
                    value={access.source === 'global_inherited' ? 'Inherited (global admin)' : 'Domain member'}
                  />
                )}
              </div>

              {/* Assigned roles */}
              {access?.assignedRoles && access.assignedRoles.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-text-muted mb-2">Assigned Roles</h4>
                  <div className="flex flex-wrap gap-2">
                    {access.assignedRoles.map((role) => (
                      <RoleBadge key={role.id} role={role} />
                    ))}
                  </div>
                </div>
              )}

              {/* Group memberships */}
              {access?.groups && access.groups.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-text-muted mb-2">Group Memberships</h4>
                  <div className="flex flex-wrap gap-2">
                    {access.groups.map((group) => (
                      <span
                        key={group.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-surface border border-border rounded-full text-text-primary"
                      >
                        <GroupIcon className="w-3 h-3 text-text-muted" />
                        {group.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Effective permissions */}
              <EffectivePermissions
                domainId={domainId}
                userId={userId}
                permissionCatalog={
                  catalogData
                    ? {
                        permissions: catalogData.permissions,
                        categories: catalogData.categories,
                      }
                    : undefined
                }
              />
            </div>
          )}
        </div>

        {/* Quick action footer */}
        <div className="flex-shrink-0 border-t border-border px-6 py-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Quick Actions
          </p>
          <div className="grid grid-cols-2 gap-2">
            <QuickActionButton
              icon={<ShieldPlusIcon className="w-4 h-4" />}
              label="Assign Role"
              onClick={() => {
                /* handled by parent */
              }}
              variant="default"
            />
            <QuickActionButton
              icon={<UsersIcon className="w-4 h-4" />}
              label="Add to Group"
              onClick={() => {
                /* handled by parent */
              }}
              variant="default"
            />
            <QuickActionButton
              icon={<PauseIcon className="w-4 h-4" />}
              label="Suspend"
              onClick={() => {
                /* handled by parent */
              }}
              variant="warning"
              disabled={userStatus === 'banned'}
            />
            <QuickActionButton
              icon={<BanIcon className="w-4 h-4" />}
              label="Ban"
              onClick={() => {
                /* handled by parent */
              }}
              variant="danger"
              disabled={userStatus === 'banned'}
            />
          </div>
        </div>
      </div>
    </>
  );
}

// Sub-components

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-text-muted w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span
        className={cn(
          'text-sm text-text-primary break-all flex-1',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </span>
    </div>
  );
}

interface RoleBadgeProps {
  role: {
    id: string;
    name: string;
    displayName?: string;
    isSystem: boolean;
    priority: number;
  };
}

// Role badge color based on priority level
function roleBadgeStyle(priority: number, isSystem: boolean): string {
  if (isSystem) return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
  if (priority >= 80) return 'bg-red-500/10 text-red-500 border-red-500/20';
  if (priority >= 50) return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
  return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
}

function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border font-medium',
        roleBadgeStyle(role.priority, role.isSystem)
      )}
    >
      <ShieldIcon className="w-3 h-3" />
      {role.displayName || role.name}
      {role.isSystem && (
        <span className="opacity-60 font-normal">(system)</span>
      )}
    </span>
  );
}

interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'warning' | 'danger';
  disabled?: boolean;
}

function QuickActionButton({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
}: QuickActionButtonProps) {
  const variantClasses = {
    default:
      'bg-surface border-border text-text-primary hover:bg-surface-hover hover:border-accent/50',
    warning:
      'bg-surface border-border text-yellow-500 hover:bg-yellow-500/10 hover:border-yellow-500/30',
    danger:
      'bg-surface border-border text-red-500 hover:bg-red-500/10 hover:border-red-500/30',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors',
        variantClasses[variant],
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// Icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function UserCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function ShieldPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function BanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  );
}
