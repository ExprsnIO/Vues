/**
 * RBAC Service
 * Role-Based Access Control for domain administration
 */

import { nanoid } from 'nanoid';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

/**
 * Permission definition
 */
export interface Permission {
  key: string;
  name: string;
  description: string;
  category: string;
  implies?: string[]; // Permissions this one implies
}

/**
 * Role definition
 */
export interface Role {
  id: string;
  domainId: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User role assignment
 */
export interface UserRole {
  id: string;
  domainUserId: string;
  roleId: string;
  assignedBy?: string;
  createdAt: Date;
}

/**
 * Group definition
 */
export interface Group {
  id: string;
  domainId: string;
  name: string;
  description?: string;
  memberCount: number;
  permissions: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User group membership
 */
export interface GroupMembership {
  id: string;
  userDid: string;
  groupId: string;
  addedBy?: string;
  createdAt: Date;
}

// Built-in permissions
const PERMISSIONS: Permission[] = [
  // Domain management
  { key: 'domain.view', name: 'View Domain', description: 'View domain settings', category: 'domain' },
  { key: 'domain.edit', name: 'Edit Domain', description: 'Edit domain settings', category: 'domain', implies: ['domain.view'] },
  { key: 'domain.delete', name: 'Delete Domain', description: 'Delete the domain', category: 'domain', implies: ['domain.edit'] },
  { key: 'domain.branding', name: 'Manage Branding', description: 'Edit domain branding', category: 'domain', implies: ['domain.view'] },
  { key: 'domain.features', name: 'Manage Features', description: 'Toggle feature flags', category: 'domain', implies: ['domain.view'] },

  // User management
  { key: 'users.view', name: 'View Users', description: 'View user list', category: 'users' },
  { key: 'users.invite', name: 'Invite Users', description: 'Invite new users', category: 'users', implies: ['users.view'] },
  { key: 'users.edit', name: 'Edit Users', description: 'Edit user profiles', category: 'users', implies: ['users.view'] },
  { key: 'users.delete', name: 'Delete Users', description: 'Delete users', category: 'users', implies: ['users.edit'] },
  { key: 'users.suspend', name: 'Suspend Users', description: 'Suspend user accounts', category: 'users', implies: ['users.view'] },
  { key: 'users.roles', name: 'Manage User Roles', description: 'Assign roles to users', category: 'users', implies: ['users.view', 'roles.view'] },

  // Role management
  { key: 'roles.view', name: 'View Roles', description: 'View role definitions', category: 'roles' },
  { key: 'roles.create', name: 'Create Roles', description: 'Create new roles', category: 'roles', implies: ['roles.view'] },
  { key: 'roles.edit', name: 'Edit Roles', description: 'Edit role permissions', category: 'roles', implies: ['roles.view'] },
  { key: 'roles.delete', name: 'Delete Roles', description: 'Delete roles', category: 'roles', implies: ['roles.edit'] },

  // Group management
  { key: 'groups.view', name: 'View Groups', description: 'View groups', category: 'groups' },
  { key: 'groups.create', name: 'Create Groups', description: 'Create new groups', category: 'groups', implies: ['groups.view'] },
  { key: 'groups.edit', name: 'Edit Groups', description: 'Edit groups', category: 'groups', implies: ['groups.view'] },
  { key: 'groups.delete', name: 'Delete Groups', description: 'Delete groups', category: 'groups', implies: ['groups.edit'] },
  { key: 'groups.members', name: 'Manage Group Members', description: 'Add/remove group members', category: 'groups', implies: ['groups.view', 'users.view'] },

  // Content moderation
  { key: 'moderation.view', name: 'View Mod Queue', description: 'View moderation queue', category: 'moderation' },
  { key: 'moderation.review', name: 'Review Content', description: 'Review flagged content', category: 'moderation', implies: ['moderation.view'] },
  { key: 'moderation.action', name: 'Take Mod Actions', description: 'Approve/reject content', category: 'moderation', implies: ['moderation.review'] },
  { key: 'moderation.appeals', name: 'Handle Appeals', description: 'Process user appeals', category: 'moderation', implies: ['moderation.action'] },
  { key: 'moderation.policies', name: 'Manage Policies', description: 'Edit moderation policies', category: 'moderation', implies: ['moderation.view'] },

  // Analytics
  { key: 'analytics.view', name: 'View Analytics', description: 'View domain analytics', category: 'analytics' },
  { key: 'analytics.export', name: 'Export Analytics', description: 'Export analytics data', category: 'analytics', implies: ['analytics.view'] },

  // SSO
  { key: 'sso.view', name: 'View SSO Config', description: 'View SSO settings', category: 'sso' },
  { key: 'sso.edit', name: 'Edit SSO Config', description: 'Edit SSO settings', category: 'sso', implies: ['sso.view'] },
  { key: 'sso.providers', name: 'Manage Providers', description: 'Add/remove identity providers', category: 'sso', implies: ['sso.edit'] },

  // Services
  { key: 'services.view', name: 'View Services', description: 'View service status', category: 'services' },
  { key: 'services.config', name: 'Configure Services', description: 'Configure service settings', category: 'services', implies: ['services.view'] },
  { key: 'services.restart', name: 'Restart Services', description: 'Restart services', category: 'services', implies: ['services.view'] },

  // API tokens
  { key: 'tokens.view', name: 'View Tokens', description: 'View API tokens', category: 'tokens' },
  { key: 'tokens.create', name: 'Create Tokens', description: 'Create API tokens', category: 'tokens', implies: ['tokens.view'] },
  { key: 'tokens.revoke', name: 'Revoke Tokens', description: 'Revoke API tokens', category: 'tokens', implies: ['tokens.view'] },

  // Audit
  { key: 'audit.view', name: 'View Audit Log', description: 'View audit log', category: 'audit' },
  { key: 'audit.export', name: 'Export Audit Log', description: 'Export audit data', category: 'audit', implies: ['audit.view'] },
];

// System roles
const SYSTEM_ROLES: Omit<Role, 'id' | 'domainId' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Owner',
    description: 'Full access to all domain features',
    permissions: PERMISSIONS.map((p) => p.key),
    isSystem: true,
    priority: 100,
  },
  {
    name: 'Admin',
    description: 'Administrative access excluding destructive actions',
    permissions: PERMISSIONS.filter((p) => !p.key.endsWith('.delete')).map((p) => p.key),
    isSystem: true,
    priority: 90,
  },
  {
    name: 'Moderator',
    description: 'Content moderation access',
    permissions: [
      'moderation.view', 'moderation.review', 'moderation.action', 'moderation.appeals',
      'users.view', 'users.suspend',
      'analytics.view',
    ],
    isSystem: true,
    priority: 50,
  },
  {
    name: 'Support',
    description: 'Customer support access',
    permissions: [
      'users.view', 'users.edit',
      'analytics.view',
      'audit.view',
    ],
    isSystem: true,
    priority: 30,
  },
  {
    name: 'Viewer',
    description: 'Read-only access',
    permissions: PERMISSIONS.filter((p) => p.key.endsWith('.view')).map((p) => p.key),
    isSystem: true,
    priority: 10,
  },
];

export class RBACService {
  private db: PostgresJsDatabase<typeof schema>;
  private permissionCache: Map<string, Set<string>> = new Map();

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  // ==========================================
  // Permissions
  // ==========================================

  /**
   * Get all permission definitions
   */
  getPermissions(): Permission[] {
    return PERMISSIONS;
  }

  /**
   * Get permissions by category
   */
  getPermissionsByCategory(category: string): Permission[] {
    return PERMISSIONS.filter((p) => p.category === category);
  }

  /**
   * Get permission categories
   */
  getPermissionCategories(): string[] {
    const categories = new Set(PERMISSIONS.map((p) => p.category));
    return Array.from(categories);
  }

  /**
   * Expand permissions to include implied permissions
   */
  expandPermissions(permissions: string[]): string[] {
    const expanded = new Set(permissions);

    for (const perm of permissions) {
      const definition = PERMISSIONS.find((p) => p.key === perm);
      if (definition?.implies) {
        for (const implied of definition.implies) {
          expanded.add(implied);
        }
      }
    }

    return Array.from(expanded);
  }

  // ==========================================
  // Roles
  // ==========================================

  /**
   * Get system roles
   */
  getSystemRoles(): Omit<Role, 'id' | 'domainId' | 'createdAt' | 'updatedAt'>[] {
    return SYSTEM_ROLES;
  }

  /**
   * Initialize system roles for a domain
   */
  async initializeDomainRoles(domainId: string): Promise<Role[]> {
    const roles: Role[] = [];
    const now = new Date();

    for (const systemRole of SYSTEM_ROLES) {
      // Check if already exists
      const existing = await this.db.query.domainRoles.findFirst({
        where: and(
          eq(schema.domainRoles.domainId, domainId),
          eq(schema.domainRoles.name, systemRole.name),
          eq(schema.domainRoles.isSystem, true)
        ),
      });

      if (existing) {
        roles.push(this.toRole(existing));
        continue;
      }

      const values: any = {
        id: nanoid(),
        domainId,
        name: systemRole.name,
        displayName: systemRole.name,
        permissions: systemRole.permissions,
        isSystem: true,
        priority: systemRole.priority,
        createdAt: now,
        updatedAt: now,
      };

      if (systemRole.description) {
        values.description = systemRole.description;
      }

      const [inserted] = await this.db
        .insert(schema.domainRoles)
        .values(values)
        .returning();

      if (inserted) {
        roles.push(this.toRole(inserted));
      }
    }

    return roles;
  }

  /**
   * Get roles for a domain
   */
  async getDomainRoles(domainId: string): Promise<Role[]> {
    const roles = await this.db.query.domainRoles.findMany({
      where: eq(schema.domainRoles.domainId, domainId),
      orderBy: (roles, { desc }) => [desc(roles.priority)],
    });

    return roles.map((r) => this.toRole(r));
  }

  /**
   * Get role by ID
   */
  async getRole(roleId: string): Promise<Role | null> {
    const role = await this.db.query.domainRoles.findFirst({
      where: eq(schema.domainRoles.id, roleId),
    });

    return role ? this.toRole(role) : null;
  }

  /**
   * Create a custom role
   */
  async createRole(
    domainId: string,
    role: {
      name: string;
      description?: string;
      permissions: string[];
      priority?: number;
    }
  ): Promise<Role> {
    const now = new Date();

    const values: any = {
      id: nanoid(),
      domainId,
      name: role.name,
      displayName: role.name,
      permissions: role.permissions,
      isSystem: false,
      priority: role.priority || 0,
      createdAt: now,
      updatedAt: now,
    };

    if (role.description) {
      values.description = role.description;
    }

    const [inserted] = await this.db
      .insert(schema.domainRoles)
      .values(values)
      .returning();

    return this.toRole(inserted!);
  }

  /**
   * Update a role
   */
  async updateRole(
    roleId: string,
    updates: {
      name?: string;
      description?: string;
      permissions?: string[];
      priority?: number;
    }
  ): Promise<Role | null> {
    const role = await this.getRole(roleId);
    if (!role || role.isSystem) {
      return null; // Can't update system roles
    }

    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) {
      updateValues.name = updates.name;
      updateValues.displayName = updates.name;
    }
    if (updates.description !== undefined) {
      updateValues.description = updates.description;
    }
    if (updates.permissions !== undefined) {
      updateValues.permissions = updates.permissions;
    }
    if (updates.priority !== undefined) {
      updateValues.priority = updates.priority;
    }

    const [updated] = await this.db
      .update(schema.domainRoles)
      .set(updateValues)
      .where(eq(schema.domainRoles.id, roleId))
      .returning();

    // Invalidate cache for affected users
    this.clearCache();

    return updated ? this.toRole(updated) : null;
  }

  /**
   * Delete a role
   */
  async deleteRole(roleId: string): Promise<boolean> {
    const role = await this.getRole(roleId);
    if (!role || role.isSystem) {
      return false; // Can't delete system roles
    }

    // Remove role assignments first
    await this.db
      .delete(schema.domainUserRoles)
      .where(eq(schema.domainUserRoles.roleId, roleId));

    const result = await this.db
      .delete(schema.domainRoles)
      .where(eq(schema.domainRoles.id, roleId))
      .returning();

    this.clearCache();

    return result.length > 0;
  }

  // ==========================================
  // User Roles
  // ==========================================

  /**
   * Assign role to user
   */
  async assignRole(
    domainUserId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<UserRole> {
    // Check if already assigned
    const existing = await this.db.query.domainUserRoles.findFirst({
      where: and(
        eq(schema.domainUserRoles.domainUserId, domainUserId),
        eq(schema.domainUserRoles.roleId, roleId)
      ),
    });

    if (existing) {
      return this.toUserRole(existing);
    }

    const values: any = {
      id: nanoid(),
      domainUserId,
      roleId,
      createdAt: new Date(),
    };

    if (assignedBy) {
      values.assignedBy = assignedBy;
    }

    const [inserted] = await this.db
      .insert(schema.domainUserRoles)
      .values(values)
      .returning();

    // Invalidate cache
    this.permissionCache.delete(domainUserId);

    return this.toUserRole(inserted!);
  }

  /**
   * Remove role from user
   */
  async removeRole(domainUserId: string, roleId: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.domainUserRoles)
      .where(
        and(
          eq(schema.domainUserRoles.domainUserId, domainUserId),
          eq(schema.domainUserRoles.roleId, roleId)
        )
      )
      .returning();

    // Invalidate cache
    this.permissionCache.delete(domainUserId);

    return result.length > 0;
  }

  /**
   * Get user's roles in a domain
   */
  async getUserRoles(domainUserId: string): Promise<Role[]> {
    const assignments = await this.db.query.domainUserRoles.findMany({
      where: eq(schema.domainUserRoles.domainUserId, domainUserId),
    });

    if (assignments.length === 0) {
      return [];
    }

    const roleIds = assignments.map((a) => a.roleId);
    const roles = await this.db.query.domainRoles.findMany({
      where: inArray(schema.domainRoles.id, roleIds),
    });

    return roles.map((r) => this.toRole(r));
  }

  /**
   * Get effective permissions for a user in a domain
   */
  async getUserPermissions(domainUserId: string): Promise<string[]> {
    const cached = this.permissionCache.get(domainUserId);
    if (cached) {
      return Array.from(cached);
    }

    // Get domain user to find userDid and domainId
    const domainUser = await this.db.query.domainUsers.findFirst({
      where: eq(schema.domainUsers.id, domainUserId),
    });

    if (!domainUser) {
      return [];
    }

    // Get direct roles
    const roles = await this.getUserRoles(domainUserId);

    // Get group roles
    const groupMemberships = await this.db.query.domainGroupMembers.findMany({
      where: eq(schema.domainGroupMembers.userDid, domainUser.userDid),
    });

    if (groupMemberships.length > 0) {
      const groupIds = groupMemberships.map((m) => m.groupId);
      const groups = await this.db.query.domainGroups.findMany({
        where: and(
          inArray(schema.domainGroups.id, groupIds),
          eq(schema.domainGroups.domainId, domainUser.domainId)
        ),
      });

      // Groups have direct permissions, not role IDs
      for (const group of groups) {
        const groupPermissions = (group.permissions as string[]) || [];
        roles.push({
          id: `group-${group.id}`,
          domainId: group.domainId,
          name: group.name,
          permissions: groupPermissions,
          isSystem: false,
          priority: 0,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
        });
      }
    }

    // Aggregate permissions
    const allPermissions = new Set<string>();
    for (const role of roles) {
      const expanded = this.expandPermissions(role.permissions);
      expanded.forEach((p) => allPermissions.add(p));
    }

    // Cache result
    this.permissionCache.set(domainUserId, allPermissions);

    return Array.from(allPermissions);
  }

  /**
   * Check if user has permission
   */
  async hasPermission(
    domainUserId: string,
    permission: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(domainUserId);
    return permissions.includes(permission);
  }

  /**
   * Check if user has any of the permissions
   */
  async hasAnyPermission(
    domainUserId: string,
    permissions: string[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(domainUserId);
    return permissions.some((p) => userPermissions.includes(p));
  }

  /**
   * Check if user has all permissions
   */
  async hasAllPermissions(
    domainUserId: string,
    permissions: string[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(domainUserId);
    return permissions.every((p) => userPermissions.includes(p));
  }

  // ==========================================
  // Groups
  // ==========================================

  /**
   * Create a group
   */
  async createGroup(
    domainId: string,
    group: {
      name: string;
      description?: string;
      permissions?: string[];
      isDefault?: boolean;
    }
  ): Promise<Group> {
    const now = new Date();

    const values: any = {
      id: nanoid(),
      domainId,
      name: group.name,
      permissions: group.permissions || [],
      isDefault: group.isDefault || false,
      memberCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (group.description) {
      values.description = group.description;
    }

    const [inserted] = await this.db
      .insert(schema.domainGroups)
      .values(values)
      .returning();

    return this.toGroup(inserted!);
  }

  /**
   * Get groups for a domain
   */
  async getDomainGroups(domainId: string): Promise<Group[]> {
    const groups = await this.db.query.domainGroups.findMany({
      where: eq(schema.domainGroups.domainId, domainId),
    });

    return groups.map((g) => this.toGroup(g));
  }

  /**
   * Get group by ID
   */
  async getGroup(groupId: string): Promise<Group | null> {
    const group = await this.db.query.domainGroups.findFirst({
      where: eq(schema.domainGroups.id, groupId),
    });

    return group ? this.toGroup(group) : null;
  }

  /**
   * Update group
   */
  async updateGroup(
    groupId: string,
    updates: {
      name?: string;
      description?: string;
      permissions?: string[];
    }
  ): Promise<Group | null> {
    const updateValues: any = {
      updatedAt: new Date(),
    };

    if (updates.name !== undefined) {
      updateValues.name = updates.name;
    }
    if (updates.description !== undefined) {
      updateValues.description = updates.description;
    }
    if (updates.permissions !== undefined) {
      updateValues.permissions = updates.permissions;
    }

    const [updated] = await this.db
      .update(schema.domainGroups)
      .set(updateValues)
      .where(eq(schema.domainGroups.id, groupId))
      .returning();

    if (updated) {
      this.clearCache();
    }

    return updated ? this.toGroup(updated) : null;
  }

  /**
   * Delete group
   */
  async deleteGroup(groupId: string): Promise<boolean> {
    // Remove memberships first
    await this.db
      .delete(schema.domainGroupMembers)
      .where(eq(schema.domainGroupMembers.groupId, groupId));

    const result = await this.db
      .delete(schema.domainGroups)
      .where(eq(schema.domainGroups.id, groupId))
      .returning();

    this.clearCache();

    return result.length > 0;
  }

  /**
   * Add user to group
   */
  async addGroupMember(
    groupId: string,
    userDid: string,
    addedBy?: string
  ): Promise<GroupMembership> {
    const existing = await this.db.query.domainGroupMembers.findFirst({
      where: and(
        eq(schema.domainGroupMembers.groupId, groupId),
        eq(schema.domainGroupMembers.userDid, userDid)
      ),
    });

    if (existing) {
      return this.toGroupMembership(existing);
    }

    const values: any = {
      id: nanoid(),
      groupId,
      userDid,
      createdAt: new Date(),
    };

    if (addedBy) {
      values.addedBy = addedBy;
    }

    const [inserted] = await this.db
      .insert(schema.domainGroupMembers)
      .values(values)
      .returning();

    // Update member count
    await this.db.execute(
      sql`UPDATE domain_groups SET member_count = member_count + 1 WHERE id = ${groupId}`
    );

    // Invalidate cache for user - need to find domainUserId
    const group = await this.getGroup(groupId);
    if (group) {
      const domainUser = await this.db.query.domainUsers.findFirst({
        where: and(
          eq(schema.domainUsers.domainId, group.domainId),
          eq(schema.domainUsers.userDid, userDid)
        ),
      });
      if (domainUser) {
        this.permissionCache.delete(domainUser.id);
      }
    }

    return this.toGroupMembership(inserted!);
  }

  /**
   * Remove user from group
   */
  async removeGroupMember(groupId: string, userDid: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.domainGroupMembers)
      .where(
        and(
          eq(schema.domainGroupMembers.groupId, groupId),
          eq(schema.domainGroupMembers.userDid, userDid)
        )
      )
      .returning();

    if (result.length > 0) {
      // Update member count
      await this.db.execute(
        sql`UPDATE domain_groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = ${groupId}`
      );

      // Invalidate cache
      const group = await this.getGroup(groupId);
      if (group) {
        const domainUser = await this.db.query.domainUsers.findFirst({
          where: and(
            eq(schema.domainUsers.domainId, group.domainId),
            eq(schema.domainUsers.userDid, userDid)
          ),
        });
        if (domainUser) {
          this.permissionCache.delete(domainUser.id);
        }
      }
    }

    return result.length > 0;
  }

  /**
   * Get group members
   */
  async getGroupMembers(groupId: string): Promise<GroupMembership[]> {
    const members = await this.db.query.domainGroupMembers.findMany({
      where: eq(schema.domainGroupMembers.groupId, groupId),
    });

    return members.map((m) => this.toGroupMembership(m));
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private toRole(r: typeof schema.domainRoles.$inferSelect): Role {
    return {
      id: r.id,
      domainId: r.domainId,
      name: r.name,
      description: r.description || undefined,
      permissions: (r.permissions as string[]) || [],
      isSystem: r.isSystem ?? false,
      priority: r.priority || 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private toUserRole(r: typeof schema.domainUserRoles.$inferSelect): UserRole {
    return {
      id: r.id,
      domainUserId: r.domainUserId,
      roleId: r.roleId,
      assignedBy: r.assignedBy || undefined,
      createdAt: r.createdAt,
    };
  }

  private toGroup(g: typeof schema.domainGroups.$inferSelect): Group {
    return {
      id: g.id,
      domainId: g.domainId,
      name: g.name,
      description: g.description || undefined,
      memberCount: g.memberCount || 0,
      permissions: (g.permissions as string[]) || [],
      isDefault: g.isDefault ?? false,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  private toGroupMembership(m: typeof schema.domainGroupMembers.$inferSelect): GroupMembership {
    return {
      id: m.id,
      userDid: m.userDid,
      groupId: m.groupId,
      addedBy: m.addedBy || undefined,
      createdAt: m.createdAt,
    };
  }

  private clearCache(): void {
    this.permissionCache.clear();
  }
}

/**
 * Create RBACService instance
 */
export function createRBACService(
  db: PostgresJsDatabase<typeof schema>
): RBACService {
  return new RBACService(db);
}
