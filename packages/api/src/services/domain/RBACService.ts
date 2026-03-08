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
  parentRoleId?: string;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User role assignment
 */
export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  domainId: string;
  grantedBy?: string;
  grantedAt: Date;
  expiresAt?: Date;
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
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User group membership
 */
export interface GroupMembership {
  id: string;
  userId: string;
  groupId: string;
  addedBy?: string;
  addedAt: Date;
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
    return [...new Set(PERMISSIONS.map((p) => p.category))];
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

      const [inserted] = await this.db
        .insert(schema.domainRoles)
        .values({
          id: nanoid(),
          domainId,
          name: systemRole.name,
          description: systemRole.description,
          permissions: systemRole.permissions,
          isSystem: true,
          priority: systemRole.priority,
          createdAt: now,
          updatedAt: now,
        })
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
      parentRoleId?: string;
      priority?: number;
    }
  ): Promise<Role> {
    const now = new Date();

    const [inserted] = await this.db
      .insert(schema.domainRoles)
      .values({
        id: nanoid(),
        domainId,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: false,
        parentRoleId: role.parentRoleId,
        priority: role.priority || 0,
        createdAt: now,
        updatedAt: now,
      })
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

    const [updated] = await this.db
      .update(schema.domainRoles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
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
    userId: string,
    roleId: string,
    domainId: string,
    grantedBy?: string,
    expiresAt?: Date
  ): Promise<UserRole> {
    // Check if already assigned
    const existing = await this.db.query.domainUserRoles.findFirst({
      where: and(
        eq(schema.domainUserRoles.userId, userId),
        eq(schema.domainUserRoles.roleId, roleId),
        eq(schema.domainUserRoles.domainId, domainId)
      ),
    });

    if (existing) {
      // Update expiration if different
      if (expiresAt !== existing.expiresAt) {
        const [updated] = await this.db
          .update(schema.domainUserRoles)
          .set({ expiresAt })
          .where(eq(schema.domainUserRoles.id, existing.id))
          .returning();
        return this.toUserRole(updated!);
      }
      return this.toUserRole(existing);
    }

    const [inserted] = await this.db
      .insert(schema.domainUserRoles)
      .values({
        id: nanoid(),
        userId,
        roleId,
        domainId,
        grantedBy,
        grantedAt: new Date(),
        expiresAt,
      })
      .returning();

    // Invalidate cache
    this.permissionCache.delete(`${userId}:${domainId}`);

    return this.toUserRole(inserted!);
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string, domainId: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.domainUserRoles)
      .where(
        and(
          eq(schema.domainUserRoles.userId, userId),
          eq(schema.domainUserRoles.roleId, roleId),
          eq(schema.domainUserRoles.domainId, domainId)
        )
      )
      .returning();

    // Invalidate cache
    this.permissionCache.delete(`${userId}:${domainId}`);

    return result.length > 0;
  }

  /**
   * Get user's roles in a domain
   */
  async getUserRoles(userId: string, domainId: string): Promise<Role[]> {
    const now = new Date();

    const assignments = await this.db.query.domainUserRoles.findMany({
      where: and(
        eq(schema.domainUserRoles.userId, userId),
        eq(schema.domainUserRoles.domainId, domainId)
      ),
    });

    // Filter out expired assignments
    const validAssignments = assignments.filter(
      (a) => !a.expiresAt || a.expiresAt > now
    );

    if (validAssignments.length === 0) {
      return [];
    }

    const roleIds = validAssignments.map((a) => a.roleId);
    const roles = await this.db.query.domainRoles.findMany({
      where: inArray(schema.domainRoles.id, roleIds),
    });

    return roles.map((r) => this.toRole(r));
  }

  /**
   * Get effective permissions for a user in a domain
   */
  async getUserPermissions(userId: string, domainId: string): Promise<string[]> {
    const cacheKey = `${userId}:${domainId}`;
    const cached = this.permissionCache.get(cacheKey);
    if (cached) {
      return Array.from(cached);
    }

    // Get direct roles
    const roles = await this.getUserRoles(userId, domainId);

    // Get group roles
    const groupMemberships = await this.db.query.domainGroupMembers.findMany({
      where: eq(schema.domainGroupMembers.userId, userId),
    });

    if (groupMemberships.length > 0) {
      const groupIds = groupMemberships.map((m) => m.groupId);
      const groups = await this.db.query.domainGroups.findMany({
        where: and(
          inArray(schema.domainGroups.id, groupIds),
          eq(schema.domainGroups.domainId, domainId)
        ),
      });

      for (const group of groups) {
        const groupRoleIds = (group.roleIds as string[]) || [];
        if (groupRoleIds.length > 0) {
          const groupRoles = await this.db.query.domainRoles.findMany({
            where: inArray(schema.domainRoles.id, groupRoleIds),
          });
          roles.push(...groupRoles.map((r) => this.toRole(r)));
        }
      }
    }

    // Aggregate permissions
    const allPermissions = new Set<string>();
    for (const role of roles) {
      const expanded = this.expandPermissions(role.permissions);
      expanded.forEach((p) => allPermissions.add(p));
    }

    // Cache result
    this.permissionCache.set(cacheKey, allPermissions);

    return Array.from(allPermissions);
  }

  /**
   * Check if user has permission
   */
  async hasPermission(
    userId: string,
    domainId: string,
    permission: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, domainId);
    return permissions.includes(permission);
  }

  /**
   * Check if user has any of the permissions
   */
  async hasAnyPermission(
    userId: string,
    domainId: string,
    permissions: string[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, domainId);
    return permissions.some((p) => userPermissions.includes(p));
  }

  /**
   * Check if user has all permissions
   */
  async hasAllPermissions(
    userId: string,
    domainId: string,
    permissions: string[]
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, domainId);
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
      roles?: string[];
    }
  ): Promise<Group> {
    const now = new Date();

    const [inserted] = await this.db
      .insert(schema.domainGroups)
      .values({
        id: nanoid(),
        domainId,
        name: group.name,
        description: group.description,
        roleIds: group.roles || [],
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      })
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
      roles?: string[];
    }
  ): Promise<Group | null> {
    const [updated] = await this.db
      .update(schema.domainGroups)
      .set({
        name: updates.name,
        description: updates.description,
        roleIds: updates.roles,
        updatedAt: new Date(),
      })
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
    userId: string,
    addedBy?: string
  ): Promise<GroupMembership> {
    const existing = await this.db.query.domainGroupMembers.findFirst({
      where: and(
        eq(schema.domainGroupMembers.groupId, groupId),
        eq(schema.domainGroupMembers.userId, userId)
      ),
    });

    if (existing) {
      return this.toGroupMembership(existing);
    }

    const [inserted] = await this.db
      .insert(schema.domainGroupMembers)
      .values({
        id: nanoid(),
        groupId,
        userId,
        addedBy,
        addedAt: new Date(),
      })
      .returning();

    // Update member count
    await this.db
      .update(schema.domainGroups)
      .set({
        memberCount: sql`${schema.domainGroups.memberCount} + 1`,
      })
      .where(eq(schema.domainGroups.id, groupId));

    // Invalidate cache for user
    const group = await this.getGroup(groupId);
    if (group) {
      this.permissionCache.delete(`${userId}:${group.domainId}`);
    }

    return this.toGroupMembership(inserted!);
  }

  /**
   * Remove user from group
   */
  async removeGroupMember(groupId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.domainGroupMembers)
      .where(
        and(
          eq(schema.domainGroupMembers.groupId, groupId),
          eq(schema.domainGroupMembers.userId, userId)
        )
      )
      .returning();

    if (result.length > 0) {
      // Update member count
      await this.db
        .update(schema.domainGroups)
        .set({
          memberCount: sql`GREATEST(${schema.domainGroups.memberCount} - 1, 0)`,
        })
        .where(eq(schema.domainGroups.id, groupId));

      // Invalidate cache
      const group = await this.getGroup(groupId);
      if (group) {
        this.permissionCache.delete(`${userId}:${group.domainId}`);
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
      parentRoleId: r.parentRoleId || undefined,
      priority: r.priority || 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private toUserRole(r: typeof schema.domainUserRoles.$inferSelect): UserRole {
    return {
      id: r.id,
      userId: r.userId,
      roleId: r.roleId,
      domainId: r.domainId,
      grantedBy: r.grantedBy || undefined,
      grantedAt: r.grantedAt,
      expiresAt: r.expiresAt || undefined,
    };
  }

  private toGroup(g: typeof schema.domainGroups.$inferSelect): Group {
    return {
      id: g.id,
      domainId: g.domainId,
      name: g.name,
      description: g.description || undefined,
      memberCount: g.memberCount || 0,
      roles: (g.roleIds as string[]) || [],
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }

  private toGroupMembership(m: typeof schema.domainGroupMembers.$inferSelect): GroupMembership {
    return {
      id: m.id,
      userId: m.userId,
      groupId: m.groupId,
      addedBy: m.addedBy || undefined,
      addedAt: m.addedAt,
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
