import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  DOMAIN_PERMISSION_DEFINITIONS,
  DOMAIN_SYSTEM_ROLES,
  type DomainPermission,
  type DomainRoleSummary,
  type EffectiveDomainAccess,
} from '@exprsn/shared';
import { db } from '../db/index.js';
import {
  adminUsers,
  domainGroupMembers,
  domainGroupRoles,
  domainGroups,
  domainRoles,
  domainUserRoles,
  domainUsers,
  users,
} from '../db/schema.js';

const ALL_DOMAIN_PERMISSIONS = DOMAIN_PERMISSION_DEFINITIONS.map(
  (permission) => permission.id
) as DomainPermission[];

function toRoleSummary(
  role: typeof domainRoles.$inferSelect
): DomainRoleSummary {
  return {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    description: role.description ?? undefined,
    isSystem: role.isSystem,
    priority: role.priority,
    permissions: (role.permissions || []) as DomainPermission[],
  };
}

export function getDomainPermissionCatalog() {
  return DOMAIN_PERMISSION_DEFINITIONS;
}

export function isInheritedGlobalAdminRole(role: string) {
  return role === 'super_admin' || role === 'admin';
}

export async function ensureSystemDomainRoles(domainId: string) {
  const existing = await db
    .select()
    .from(domainRoles)
    .where(eq(domainRoles.domainId, domainId));

  const existingNames = new Set(existing.map((role) => role.name));
  const missingRoles = Object.values(DOMAIN_SYSTEM_ROLES).filter(
    (role) => !existingNames.has(role.name)
  );

  if (missingRoles.length === 0) {
    return existing;
  }

  await db.insert(domainRoles).values(
    missingRoles.map((role) => ({
      id: nanoid(),
      domainId,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      isSystem: true,
      priority: role.priority,
      permissions: role.permissions,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );

  return db
    .select()
    .from(domainRoles)
    .where(eq(domainRoles.domainId, domainId));
}

export async function listInheritedGlobalAdmins(domainId: string) {
  const domainAssignments = await db
    .select({ userDid: domainUsers.userDid })
    .from(domainUsers)
    .where(eq(domainUsers.domainId, domainId));

  const excludedUserDids = domainAssignments.map((assignment) => assignment.userDid);

  const inheritedAdmins = await db
    .select({
      admin: adminUsers,
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(adminUsers)
    .leftJoin(users, eq(users.did, adminUsers.userDid))
    .where(inArray(adminUsers.role, ['super_admin', 'admin']));

  return inheritedAdmins.filter(
    (row) => !excludedUserDids.includes(row.admin.userDid)
  );
}

export async function getDomainRoleSummaries(domainId: string) {
  await ensureSystemDomainRoles(domainId);
  const roles = await db
    .select()
    .from(domainRoles)
    .where(eq(domainRoles.domainId, domainId));
  return roles.map(toRoleSummary);
}

export async function getEffectiveDomainAccess(
  domainId: string,
  userDid: string
): Promise<EffectiveDomainAccess | null> {
  const [domainUser] = await db
    .select()
    .from(domainUsers)
    .where(and(eq(domainUsers.domainId, domainId), eq(domainUsers.userDid, userDid)))
    .limit(1);

  const [globalAdmin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.userDid, userDid))
    .limit(1);

  const isInheritedGlobalAdmin = !!globalAdmin && isInheritedGlobalAdminRole(globalAdmin.role);

  if (!domainUser && !isInheritedGlobalAdmin) {
    return null;
  }

  const roles = await ensureSystemDomainRoles(domainId);

  let assignedRoles: DomainRoleSummary[] = [];
  let directPermissions: DomainPermission[] = [];
  let source: 'domain' | 'global_inherited' = 'domain';

  if (domainUser) {
    const userRoleAssignments = await db
      .select({ role: domainRoles })
      .from(domainUserRoles)
      .innerJoin(domainRoles, eq(domainRoles.id, domainUserRoles.roleId))
      .where(eq(domainUserRoles.domainUserId, domainUser.id));

    assignedRoles = userRoleAssignments.map(({ role }) => toRoleSummary(role));
    directPermissions = (domainUser.permissions || []) as DomainPermission[];
  } else {
    source = 'global_inherited';
    assignedRoles = [
      {
        id: `global-${globalAdmin!.id}`,
        name: 'global_admin',
        displayName: 'Global Admin',
        description: 'Inherited global administrative access.',
        isSystem: true,
        priority: 1000,
        permissions: ALL_DOMAIN_PERMISSIONS,
      },
    ];
  }

  const memberships = await db
    .select({
      membership: domainGroupMembers,
      group: domainGroups,
    })
    .from(domainGroupMembers)
    .innerJoin(domainGroups, eq(domainGroups.id, domainGroupMembers.groupId))
    .where(eq(domainGroupMembers.userDid, userDid));

  const groupIds = memberships.map(({ group }) => group.id);
  const groupRoleAssignments = groupIds.length
    ? await db
        .select({
          assignment: domainGroupRoles,
          role: domainRoles,
        })
        .from(domainGroupRoles)
        .innerJoin(domainRoles, eq(domainRoles.id, domainGroupRoles.roleId))
        .where(inArray(domainGroupRoles.groupId, groupIds))
    : [];

  const groupRolesByGroupId = groupRoleAssignments.reduce<Record<string, DomainRoleSummary[]>>(
    (acc, row) => {
      acc[row.assignment.groupId] = acc[row.assignment.groupId] || [];
      acc[row.assignment.groupId]!.push(toRoleSummary(row.role));
      return acc;
    },
    {}
  );

  const groups = memberships.map(({ group }) => ({
    id: group.id,
    name: group.name,
    directPermissions: (group.permissions || []) as DomainPermission[],
    assignedRoles: groupRolesByGroupId[group.id] || [],
  }));

  const effectivePermissions = new Set<DomainPermission>();
  for (const permission of directPermissions) {
    effectivePermissions.add(permission);
  }
  for (const role of assignedRoles) {
    for (const permission of role.permissions) {
      effectivePermissions.add(permission);
    }
  }
  for (const group of groups) {
    for (const permission of group.directPermissions) {
      effectivePermissions.add(permission);
    }
    for (const role of group.assignedRoles) {
      for (const permission of role.permissions) {
        effectivePermissions.add(permission);
      }
    }
  }
  if (isInheritedGlobalAdmin) {
    for (const permission of ALL_DOMAIN_PERMISSIONS) {
      effectivePermissions.add(permission);
    }
    source = domainUser ? 'domain' : 'global_inherited';
  }

  return {
    domainId,
    userDid,
    source,
    directPermissions,
    assignedRoles,
    groups,
    effectivePermissions: Array.from(effectivePermissions),
  };
}

export function getLegacyDomainRole(access: EffectiveDomainAccess | null) {
  if (!access) return 'member';
  const sortedRoles = [...access.assignedRoles].sort((a, b) => b.priority - a.priority);
  const topRole = sortedRoles[0];
  if (!topRole) {
    return access.source === 'global_inherited' ? 'admin' : 'member';
  }
  if (topRole.name === 'owner' || topRole.name === 'admin' || topRole.name === 'moderator') {
    return topRole.name;
  }
  if (access.effectivePermissions.includes('domain.users.manage')) {
    return 'admin';
  }
  if (access.effectivePermissions.includes('domain.moderation.manage')) {
    return 'moderator';
  }
  return 'member';
}
