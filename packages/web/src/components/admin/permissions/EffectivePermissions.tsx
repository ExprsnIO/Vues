'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface PermissionSource {
  type: 'direct' | 'role' | 'group';
  sourceId?: string;
  sourceName?: string;
  permissions: string[];
}

interface EffectivePermissionsData {
  effectivePermissions: string[];
  breakdown: {
    direct: string[];
    fromRoles: { roleId: string; roleName: string; permissions: string[] }[];
    fromGroups: { groupId: string; groupName: string; permissions: string[] }[];
  };
}

interface EffectivePermissionsProps {
  domainId: string;
  userId: string;
  permissionCatalog?: {
    permissions: { id: string; name: string; description?: string; category: string }[];
    categories: { id: string; name: string }[];
  };
}

export function EffectivePermissions({
  domainId,
  userId,
  permissionCatalog,
}: EffectivePermissionsProps) {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set(['direct']));

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'users', userId, 'effectivePermissions'],
    queryFn: () => api.adminDomainUserEffectivePermissions(domainId, userId),
    enabled: !!domainId && !!userId,
  });

  const toggleSource = (sourceKey: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceKey)) {
        next.delete(sourceKey);
      } else {
        next.add(sourceKey);
      }
      return next;
    });
  };

  const getPermissionName = (permId: string) => {
    const perm = permissionCatalog?.permissions.find((p) => p.id === permId);
    return perm?.name || permId;
  };

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-surface-hover rounded w-1/3" />
          <div className="h-4 bg-surface-hover rounded w-2/3" />
          <div className="h-4 bg-surface-hover rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <p className="text-sm text-red-500">Failed to load permissions</p>
      </div>
    );
  }

  const permissions = data as EffectivePermissionsData | undefined;
  if (!permissions) return null;

  const sources: Array<{
    key: string;
    type: 'direct' | 'role' | 'group';
    name: string;
    icon: React.FC<{ className?: string }>;
    permissions: string[];
    color: string;
  }> = [];

  // Direct permissions
  if (permissions.breakdown.direct.length > 0) {
    sources.push({
      key: 'direct',
      type: 'direct',
      name: 'Direct Permissions',
      icon: UserIcon,
      permissions: permissions.breakdown.direct,
      color: 'blue',
    });
  }

  // Role permissions
  permissions.breakdown.fromRoles.forEach((role) => {
    sources.push({
      key: `role-${role.roleId}`,
      type: 'role',
      name: role.roleName,
      icon: ShieldIcon,
      permissions: role.permissions,
      color: 'purple',
    });
  });

  // Group permissions
  permissions.breakdown.fromGroups.forEach((group) => {
    sources.push({
      key: `group-${group.groupId}`,
      type: 'group',
      name: group.groupName,
      icon: GroupIcon,
      permissions: group.permissions,
      color: 'green',
    });
  });

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-text-primary">Effective Permissions</h3>
        <p className="text-sm text-text-muted mt-1">
          {permissions.effectivePermissions.length} total permissions from {sources.length} source{sources.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="divide-y divide-border">
        {sources.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-text-muted">No permissions assigned</p>
          </div>
        ) : (
          sources.map((source) => {
            const isExpanded = expandedSources.has(source.key);
            const Icon = source.icon;

            return (
              <div key={source.key}>
                <button
                  onClick={() => toggleSource(source.key)}
                  className="w-full px-6 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors"
                >
                  <ChevronIcon
                    className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      source.color === 'blue'
                        ? 'bg-blue-500/10'
                        : source.color === 'purple'
                        ? 'bg-purple-500/10'
                        : 'bg-green-500/10'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        source.color === 'blue'
                          ? 'text-blue-500'
                          : source.color === 'purple'
                          ? 'text-purple-500'
                          : 'text-green-500'
                      }`}
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-text-primary text-sm">{source.name}</p>
                    <p className="text-xs text-text-muted capitalize">{source.type}</p>
                  </div>
                  <span className="text-sm text-text-muted">{source.permissions.length} permissions</span>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-4 pl-16">
                    <div className="flex flex-wrap gap-1.5">
                      {source.permissions.map((permId) => (
                        <span
                          key={permId}
                          className={`px-2 py-0.5 text-xs rounded-full ${
                            source.color === 'blue'
                              ? 'bg-blue-500/10 text-blue-500'
                              : source.color === 'purple'
                              ? 'bg-purple-500/10 text-purple-500'
                              : 'bg-green-500/10 text-green-500'
                          }`}
                          title={permId}
                        >
                          {getPermissionName(permId)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* All unique permissions summary */}
      <div className="px-6 py-4 border-t border-border bg-surface-hover/50">
        <p className="text-xs font-medium text-text-muted mb-2">All Effective Permissions</p>
        <div className="flex flex-wrap gap-1">
          {permissions.effectivePermissions.map((permId) => (
            <span
              key={permId}
              className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full"
              title={permId}
            >
              {getPermissionName(permId)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Permission breakdown display for inline use
interface PermissionBreakdownInlineProps {
  breakdown: {
    direct?: string[];
    fromRoles?: { roleId: string; roleName: string; permissions: string[] }[];
    fromGroups?: { groupId: string; groupName: string; permissions: string[] }[];
  };
  permissionCatalog?: {
    permissions: { id: string; name: string }[];
  };
}

export function PermissionBreakdownInline({
  breakdown,
  permissionCatalog,
}: PermissionBreakdownInlineProps) {
  const getPermissionName = (permId: string) => {
    const perm = permissionCatalog?.permissions.find((p) => p.id === permId);
    return perm?.name || permId;
  };

  const directCount = breakdown.direct?.length || 0;
  const rolesCount = breakdown.fromRoles?.reduce((acc, r) => acc + r.permissions.length, 0) || 0;
  const groupsCount = breakdown.fromGroups?.reduce((acc, g) => acc + g.permissions.length, 0) || 0;

  return (
    <div className="flex items-center gap-3 text-xs">
      {directCount > 0 && (
        <span className="flex items-center gap-1 text-blue-500">
          <UserIcon className="w-3 h-3" />
          {directCount} direct
        </span>
      )}
      {rolesCount > 0 && (
        <span className="flex items-center gap-1 text-purple-500">
          <ShieldIcon className="w-3 h-3" />
          {rolesCount} from roles
        </span>
      )}
      {groupsCount > 0 && (
        <span className="flex items-center gap-1 text-green-500">
          <GroupIcon className="w-3 h-3" />
          {groupsCount} from groups
        </span>
      )}
      {directCount === 0 && rolesCount === 0 && groupsCount === 0 && (
        <span className="text-text-muted">No permissions</span>
      )}
    </div>
  );
}

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
