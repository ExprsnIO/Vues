'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PermissionMatrixProps {
  domainId: string;
}

interface Permission {
  id: string;
  category: string;
  label: string;
  description: string;
}

interface Role {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  priority: number;
  permissions: string[];
}

// Group permissions by their category string
function groupByCategory(permissions: Permission[]): Map<string, Permission[]> {
  const map = new Map<string, Permission[]>();
  for (const perm of permissions) {
    const cat = perm.category || 'Other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(perm);
  }
  return map;
}

export function PermissionMatrix({ domainId }: PermissionMatrixProps) {
  const queryClient = useQueryClient();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ['admin', 'domain', 'permissions', 'catalog'],
    queryFn: () => api.adminDomainPermissionCatalog(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.getDomainRoles(domainId),
    enabled: !!domainId,
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({
      roleId,
      permissions,
    }: {
      roleId: string;
      permissions: string[];
    }) => api.adminDomainRolesUpdate(domainId, roleId, { permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setPendingCell(null);
    },
    onError: () => {
      setPendingCell(null);
    },
  });

  const togglePermission = (role: Role, permissionId: string) => {
    if (role.isSystem) return;
    const cellKey = `${role.id}:${permissionId}`;
    setPendingCell(cellKey);
    const currentPerms = role.permissions;
    const newPerms = currentPerms.includes(permissionId)
      ? currentPerms.filter((p) => p !== permissionId)
      : [...currentPerms, permissionId];
    updateRoleMutation.mutate({ roleId: role.id, permissions: newPerms });
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const isLoading = catalogLoading || rolesLoading;

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-surface-hover rounded w-1/4" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-surface-hover rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!catalogData || !rolesData) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6">
        <p className="text-sm text-text-muted">Failed to load permission matrix.</p>
      </div>
    );
  }

  const permissions = catalogData.permissions;
  const roles = rolesData.roles as Role[];
  const categoryMap = groupByCategory(permissions);
  const categories = Array.from(categoryMap.keys()).sort();

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-text-primary">Permission Matrix</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {permissions.length} permissions across {roles.length} roles
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <CheckIcon className="w-4 h-4 text-accent" />
          <span>= granted</span>
          <LockIcon className="w-4 h-4 text-text-muted ml-2" />
          <span>= system role (read-only)</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-hover">
              {/* Permission column header */}
              <th className="sticky left-0 z-10 bg-surface-hover px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider min-w-[220px]">
                Permission
              </th>
              {roles.map((role) => (
                <th
                  key={role.id}
                  className="px-3 py-3 text-center min-w-[100px]"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-text-primary whitespace-nowrap">
                      {role.displayName || role.name}
                    </span>
                    {role.isSystem && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-surface text-text-muted border border-border rounded-full">
                        system
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories.map((category) => {
              const categoryPerms = categoryMap.get(category) ?? [];
              const isCollapsed = collapsedCategories.has(category);

              return (
                <>
                  {/* Category row */}
                  <tr
                    key={`cat-${category}`}
                    className="bg-surface-hover/50 cursor-pointer hover:bg-surface-hover transition-colors"
                    onClick={() => toggleCategory(category)}
                  >
                    <td
                      className="sticky left-0 z-10 bg-surface-hover/50 px-4 py-2.5 font-medium text-text-primary"
                      colSpan={1}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronIcon
                          className={cn(
                            'w-3.5 h-3.5 text-text-muted transition-transform',
                            isCollapsed ? '' : 'rotate-90'
                          )}
                        />
                        <span className="text-xs uppercase tracking-wider font-semibold text-text-muted">
                          {category}
                        </span>
                        <span className="text-xs text-text-muted/60">
                          ({categoryPerms.length})
                        </span>
                      </div>
                    </td>
                    {roles.map((role) => {
                      const grantedCount = categoryPerms.filter((p) =>
                        role.permissions.includes(p.id)
                      ).length;
                      return (
                        <td
                          key={role.id}
                          className="px-3 py-2.5 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-xs text-text-muted">
                            {grantedCount}/{categoryPerms.length}
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Permission rows */}
                  {!isCollapsed &&
                    categoryPerms.map((perm) => (
                      <tr
                        key={perm.id}
                        className="bg-surface hover:bg-surface-hover/30 transition-colors"
                      >
                        <td className="sticky left-0 z-10 bg-surface hover:bg-surface-hover/30 px-4 py-2.5 transition-colors">
                          <div className="pl-5">
                            <p className="text-sm text-text-primary font-medium leading-tight">
                              {perm.label}
                            </p>
                            <p className="text-xs text-text-muted font-mono mt-0.5 leading-tight">
                              {perm.id}
                            </p>
                            {perm.description && (
                              <p className="text-xs text-text-muted/70 mt-0.5 leading-tight hidden group-hover:block">
                                {perm.description}
                              </p>
                            )}
                          </div>
                        </td>
                        {roles.map((role) => {
                          const hasPermission = role.permissions.includes(perm.id);
                          const cellKey = `${role.id}:${perm.id}`;
                          const isPending = pendingCell === cellKey;
                          const isClickable = !role.isSystem;

                          return (
                            <td
                              key={role.id}
                              className={cn(
                                'px-3 py-2.5 text-center',
                                isClickable && 'cursor-pointer'
                              )}
                              title={
                                role.isSystem
                                  ? 'System roles cannot be modified'
                                  : hasPermission
                                  ? `Remove ${perm.label} from ${role.displayName || role.name}`
                                  : `Grant ${perm.label} to ${role.displayName || role.name}`
                              }
                              onClick={() => isClickable && togglePermission(role, perm.id)}
                            >
                              {isPending ? (
                                <SpinnerIcon className="w-4 h-4 text-accent mx-auto animate-spin" />
                              ) : hasPermission ? (
                                <CheckIcon
                                  className={cn(
                                    'w-4 h-4 mx-auto transition-colors',
                                    isClickable
                                      ? 'text-accent hover:text-accent/70'
                                      : 'text-accent'
                                  )}
                                />
                              ) : (
                                <span
                                  className={cn(
                                    'block w-4 h-4 mx-auto rounded border transition-colors',
                                    isClickable
                                      ? 'border-border hover:border-accent'
                                      : 'border-border/50'
                                  )}
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-4 py-3 border-t border-border bg-surface-hover/30">
        <p className="text-xs text-text-muted">
          Click a cell to toggle a permission for non-system roles. Changes are applied immediately.
        </p>
      </div>
    </div>
  );
}

// Icons
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
