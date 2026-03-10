/**
 * Admin Domain Groups Routes
 * XRPC endpoints for managing domain groups and their members
 */

import { Hono } from 'hono';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  domainGroups,
  domainGroupMembers,
  domainGroupRoles,
  domainRoles,
  users,
  adminAuditLog,
  type AdminUser,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';

export const adminDomainGroupsRouter = new Hono();

// Apply admin auth to all routes
adminDomainGroupsRouter.use('*', adminAuthMiddleware);

// ============================================
// Helper Functions
// ============================================

async function logAudit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  c: { req: { header: (name: string) => string | undefined } }
) {
  await db.insert(adminAuditLog).values({
    id: nanoid(),
    adminId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    userAgent: c.req.header('user-agent'),
  });
}

async function updateGroupMemberCount(groupId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(domainGroupMembers)
    .where(eq(domainGroupMembers.groupId, groupId));

  await db
    .update(domainGroups)
    .set({ memberCount: result?.count || 0, updatedAt: new Date() })
    .where(eq(domainGroups.id, groupId));
}

// ============================================
// DOMAIN GROUPS ENDPOINTS
// ============================================

/**
 * GET /xrpc/io.exprsn.admin.domains.groups.list
 * List all groups for a domain
 */
adminDomainGroupsRouter.get(
  '/io.exprsn.admin.domains.groups.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const includeDefault = c.req.query('includeDefault') !== 'false';
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    // Build where conditions
    const conditions = [eq(domainGroups.domainId, domainId)];
    if (!includeDefault) {
      conditions.push(eq(domainGroups.isDefault, false));
    }

    const results = await db
      .select({
        id: domainGroups.id,
        domainId: domainGroups.domainId,
        name: domainGroups.name,
        description: domainGroups.description,
        permissions: domainGroups.permissions,
        memberCount: domainGroups.memberCount,
        isDefault: domainGroups.isDefault,
        createdAt: domainGroups.createdAt,
        updatedAt: domainGroups.updatedAt,
      })
      .from(domainGroups)
      .where(and(...conditions))
      .orderBy(desc(domainGroups.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch assigned roles for each group
    const groupIds = results.map((g) => g.id);
    let rolesMap: Record<string, any[]> = {};

    if (groupIds.length > 0) {
      const groupRoles = await db
        .select({
          groupId: domainGroupRoles.groupId,
          roleId: domainRoles.id,
          name: domainRoles.name,
          displayName: domainRoles.displayName,
          description: domainRoles.description,
          isSystem: domainRoles.isSystem,
          priority: domainRoles.priority,
          permissions: domainRoles.permissions,
        })
        .from(domainGroupRoles)
        .leftJoin(domainRoles, eq(domainGroupRoles.roleId, domainRoles.id))
        .where(inArray(domainGroupRoles.groupId, groupIds));

      rolesMap = groupRoles.reduce(
        (acc, gr) => {
          if (!acc[gr.groupId]) acc[gr.groupId] = [];
          if (gr.roleId && gr.name) {
            const roleArray = acc[gr.groupId];
            if (roleArray) {
              roleArray.push({
                id: gr.roleId,
                name: gr.name,
                displayName: gr.displayName,
                description: gr.description,
                isSystem: gr.isSystem ?? false,
                priority: gr.priority ?? 0,
                permissions: gr.permissions || [],
              });
            }
          }
          return acc;
        },
        {} as Record<string, any[]>
      );
    }

    return c.json({
      groups: results.map((group) => ({
        id: group.id,
        domainId: group.domainId,
        name: group.name,
        description: group.description,
        permissions: group.permissions || [],
        directPermissions: group.permissions || [],
        assignedRoles: rolesMap[group.id] || [],
        memberCount: group.memberCount,
        isDefault: group.isDefault,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt?.toISOString(),
      })),
      total: results.length,
    });
  }
);

/**
 * GET /xrpc/io.exprsn.admin.domains.groups.get
 * Get a specific group
 */
adminDomainGroupsRouter.get(
  '/io.exprsn.admin.domains.groups.get',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const groupId = c.req.query('groupId');

    if (!groupId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing groupId' }, 400);
    }

    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    // Fetch assigned roles
    const assignedRoles = await db
      .select({
        id: domainRoles.id,
        name: domainRoles.name,
        displayName: domainRoles.displayName,
        description: domainRoles.description,
        isSystem: domainRoles.isSystem,
        priority: domainRoles.priority,
        permissions: domainRoles.permissions,
      })
      .from(domainGroupRoles)
      .leftJoin(domainRoles, eq(domainGroupRoles.roleId, domainRoles.id))
      .where(eq(domainGroupRoles.groupId, groupId));

    return c.json({
      id: group.id,
      domainId: group.domainId,
      name: group.name,
      description: group.description,
      permissions: group.permissions || [],
      directPermissions: group.permissions || [],
      assignedRoles: assignedRoles
        .filter((r) => r.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          displayName: r.displayName,
          description: r.description,
          isSystem: r.isSystem,
          priority: r.priority,
          permissions: r.permissions || [],
        })),
      memberCount: group.memberCount,
      isDefault: group.isDefault,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt?.toISOString(),
    });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.domains.groups.create
 * Create a new group
 */
adminDomainGroupsRouter.post(
  '/io.exprsn.admin.domains.groups.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      domainId: string;
      name: string;
      description?: string;
      permissions?: string[];
      directPermissions?: string[];
      isDefault?: boolean;
      roleIds?: string[];
    }>();

    if (!body.domainId || !body.name) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing required fields: domainId, name' },
        400
      );
    }

    // Check for duplicate group name in domain
    const [existing] = await db
      .select()
      .from(domainGroups)
      .where(
        and(eq(domainGroups.domainId, body.domainId), eq(domainGroups.name, body.name))
      )
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: 'Conflict',
          message: 'A group with this name already exists in this domain',
        },
        409
      );
    }

    const id = nanoid();
    const permissions = body.directPermissions || body.permissions || [];

    await db.insert(domainGroups).values({
      id,
      domainId: body.domainId,
      name: body.name,
      description: body.description,
      permissions: permissions,
      memberCount: 0,
      isDefault: body.isDefault || false,
    });

    // Assign roles if provided
    if (body.roleIds && body.roleIds.length > 0) {
      await db.insert(domainGroupRoles).values(
        body.roleIds.map((roleId) => ({
          id: nanoid(),
          groupId: id,
          roleId,
        }))
      );
    }

    await logAudit(
      adminUser.id,
      'domain_group_created',
      'domain_group',
      id,
      {
        domainId: body.domainId,
        name: body.name,
        permissions,
        roleIds: body.roleIds,
      },
      c
    );

    return c.json({ success: true, id }, 201);
  }
);

/**
 * POST /xrpc/io.exprsn.admin.domains.groups.update
 * Update a group
 */
adminDomainGroupsRouter.post(
  '/io.exprsn.admin.domains.groups.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      groupId: string;
      name?: string;
      description?: string;
      permissions?: string[];
      directPermissions?: string[];
      isDefault?: boolean;
      roleIds?: string[];
    }>();

    if (!body.groupId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing groupId' }, 400);
    }

    // Check if group exists
    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    const updates: {
      name?: string;
      description?: string | null;
      permissions?: string[];
      isDefault?: boolean;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.directPermissions !== undefined || body.permissions !== undefined) {
      updates.permissions = body.directPermissions || body.permissions || [];
    }
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

    await db.update(domainGroups).set(updates).where(eq(domainGroups.id, body.groupId));

    // Update role assignments if provided
    if (body.roleIds !== undefined) {
      // Delete existing role assignments
      await db.delete(domainGroupRoles).where(eq(domainGroupRoles.groupId, body.groupId));

      // Insert new role assignments
      if (body.roleIds.length > 0) {
        await db.insert(domainGroupRoles).values(
          body.roleIds.map((roleId) => ({
            id: nanoid(),
            groupId: body.groupId,
            roleId,
          }))
        );
      }
    }

    await logAudit(
      adminUser.id,
      'domain_group_updated',
      'domain_group',
      body.groupId,
      { changes: body },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.domains.groups.delete
 * Delete a group
 */
adminDomainGroupsRouter.post(
  '/io.exprsn.admin.domains.groups.delete',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{ groupId: string; domainId?: string }>();

    if (!body.groupId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing groupId' }, 400);
    }

    // Check if group exists
    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    // Cannot delete default groups
    if (group.isDefault) {
      return c.json(
        { error: 'Forbidden', message: 'Cannot delete default groups' },
        403
      );
    }

    await db.delete(domainGroups).where(eq(domainGroups.id, body.groupId));

    await logAudit(
      adminUser.id,
      'domain_group_deleted',
      'domain_group',
      body.groupId,
      {
        domainId: group.domainId,
        name: group.name,
      },
      c
    );

    return c.json({ success: true });
  }
);

// ============================================
// GROUP MEMBERS ENDPOINTS
// ============================================

/**
 * GET /xrpc/io.exprsn.admin.domains.groups.members.list
 * List members of a group
 */
adminDomainGroupsRouter.get(
  '/io.exprsn.admin.domains.groups.members.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const groupId = c.req.query('groupId');
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (!groupId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing groupId' }, 400);
    }

    const members = await db
      .select({
        id: domainGroupMembers.id,
        userDid: domainGroupMembers.userDid,
        createdAt: domainGroupMembers.createdAt,
        addedBy: domainGroupMembers.addedBy,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(domainGroupMembers)
      .leftJoin(users, eq(domainGroupMembers.userDid, users.did))
      .where(eq(domainGroupMembers.groupId, groupId))
      .orderBy(desc(domainGroupMembers.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      members: members.map((m) => ({
        userDid: m.userDid,
        createdAt: m.createdAt.toISOString(),
        addedBy: m.addedBy,
        role: 'member', // Legacy field for compatibility
        effectivePermissions: [], // Would need to calculate from group + roles
        user: {
          did: m.userDid,
          handle: m.handle,
          displayName: m.displayName,
          avatar: m.avatar,
        },
      })),
      total: members.length,
    });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.domains.groups.members.add
 * Add a user to a group
 */
adminDomainGroupsRouter.post(
  '/io.exprsn.admin.domains.groups.members.add',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{ groupId: string; userDid: string }>();

    if (!body.groupId || !body.userDid) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing required fields: groupId, userDid' },
        400
      );
    }

    // Check if group exists
    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    // Check if user already in group
    const [existing] = await db
      .select()
      .from(domainGroupMembers)
      .where(
        and(
          eq(domainGroupMembers.groupId, body.groupId),
          eq(domainGroupMembers.userDid, body.userDid)
        )
      )
      .limit(1);

    if (existing) {
      return c.json(
        { error: 'Conflict', message: 'User is already a member of this group' },
        409
      );
    }

    await db.insert(domainGroupMembers).values({
      id: nanoid(),
      groupId: body.groupId,
      userDid: body.userDid,
      addedBy: adminUser.userDid,
    });

    await updateGroupMemberCount(body.groupId);

    await logAudit(
      adminUser.id,
      'domain_group_member_added',
      'domain_group',
      body.groupId,
      { userDid: body.userDid },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.domains.groups.members.remove
 * Remove a user from a group
 */
adminDomainGroupsRouter.post(
  '/io.exprsn.admin.domains.groups.members.remove',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{ groupId: string; userDid: string }>();

    if (!body.groupId || !body.userDid) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing required fields: groupId, userDid' },
        400
      );
    }

    // Check if member exists
    const [member] = await db
      .select()
      .from(domainGroupMembers)
      .where(
        and(
          eq(domainGroupMembers.groupId, body.groupId),
          eq(domainGroupMembers.userDid, body.userDid)
        )
      )
      .limit(1);

    if (!member) {
      return c.json({ error: 'NotFound', message: 'Member not found in this group' }, 404);
    }

    await db
      .delete(domainGroupMembers)
      .where(
        and(
          eq(domainGroupMembers.groupId, body.groupId),
          eq(domainGroupMembers.userDid, body.userDid)
        )
      );

    await updateGroupMemberCount(body.groupId);

    await logAudit(
      adminUser.id,
      'domain_group_member_removed',
      'domain_group',
      body.groupId,
      { userDid: body.userDid },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.domains.groups.members.bulkSet
 * Set all members of a group (replaces existing members)
 */
adminDomainGroupsRouter.post(
  '/io.exprsn.admin.domains.groups.members.bulkSet',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{ groupId: string; userDids: string[] }>();

    if (!body.groupId || !Array.isArray(body.userDids)) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing required fields: groupId, userDids' },
        400
      );
    }

    // Check if group exists
    const [group] = await db
      .select()
      .from(domainGroups)
      .where(eq(domainGroups.id, body.groupId))
      .limit(1);

    if (!group) {
      return c.json({ error: 'NotFound', message: 'Group not found' }, 404);
    }

    // Get current members
    const currentMembers = await db
      .select({ userDid: domainGroupMembers.userDid })
      .from(domainGroupMembers)
      .where(eq(domainGroupMembers.groupId, body.groupId));

    const currentDids = new Set(currentMembers.map((m) => m.userDid));
    const newDids = new Set(body.userDids);

    // Determine adds and removes
    const toAdd = body.userDids.filter((did) => !currentDids.has(did));
    const toRemove = currentMembers
      .map((m) => m.userDid)
      .filter((did) => !newDids.has(did));

    // Remove members
    if (toRemove.length > 0) {
      await db
        .delete(domainGroupMembers)
        .where(
          and(
            eq(domainGroupMembers.groupId, body.groupId),
            inArray(domainGroupMembers.userDid, toRemove)
          )
        );
    }

    // Add new members
    if (toAdd.length > 0) {
      await db.insert(domainGroupMembers).values(
        toAdd.map((userDid) => ({
          id: nanoid(),
          groupId: body.groupId,
          userDid,
          addedBy: adminUser.userDid,
        }))
      );
    }

    await updateGroupMemberCount(body.groupId);

    await logAudit(
      adminUser.id,
      'domain_group_members_bulk_set',
      'domain_group',
      body.groupId,
      { added: toAdd.length, removed: toRemove.length, total: body.userDids.length },
      c
    );

    return c.json({ success: true, memberCount: body.userDids.length });
  }
);

export default adminDomainGroupsRouter;
