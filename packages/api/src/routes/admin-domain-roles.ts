/**
 * Admin Domain Roles Routes
 * XRPC endpoints for managing domain roles and permissions
 */

import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  domainRoles,
  adminAuditLog,
  type AdminUser,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { DOMAIN_PERMISSION_DEFINITIONS, DOMAIN_PERMISSION_CATEGORIES } from '@exprsn/shared';
import type { DomainPermission } from '@exprsn/shared';

export const adminDomainRolesRouter = new Hono();

// Apply admin auth to all routes
adminDomainRolesRouter.use('*', adminAuthMiddleware);

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

// ============================================
// DOMAIN ROLES ENDPOINTS
// ============================================

/**
 * GET /xrpc/io.exprsn.admin.domain.roles.list
 * List all roles for a domain
 */
adminDomainRolesRouter.get(
  '/io.exprsn.admin.domain.roles.list',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const includeSystem = c.req.query('includeSystem') !== 'false';
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    // Build where conditions
    const conditions = [eq(domainRoles.domainId, domainId)];
    if (!includeSystem) {
      conditions.push(eq(domainRoles.isSystem, false));
    }

    const results = await db
      .select()
      .from(domainRoles)
      .where(and(...conditions))
      .orderBy(desc(domainRoles.priority), domainRoles.name)
      .limit(limit)
      .offset(offset);

    return c.json({
      roles: results.map((role) => ({
        id: role.id,
        domainId: role.domainId,
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        isSystem: role.isSystem,
        priority: role.priority,
        permissions: role.permissions || [],
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      })),
      total: results.length,
    });
  }
);

/**
 * GET /xrpc/io.exprsn.admin.domain.roles.get
 * Get a specific role
 */
adminDomainRolesRouter.get(
  '/io.exprsn.admin.domain.roles.get',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    const roleId = c.req.query('roleId');

    if (!roleId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing roleId' }, 400);
    }

    const [role] = await db
      .select()
      .from(domainRoles)
      .where(eq(domainRoles.id, roleId))
      .limit(1);

    if (!role) {
      return c.json({ error: 'NotFound', message: 'Role not found' }, 404);
    }

    return c.json({
      id: role.id,
      domainId: role.domainId,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      isSystem: role.isSystem,
      priority: role.priority,
      permissions: role.permissions || [],
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    });
  }
);

/**
 * POST /xrpc/io.exprsn.admin.domain.roles.create
 * Create a new role
 */
adminDomainRolesRouter.post(
  '/io.exprsn.admin.domain.roles.create',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      domainId: string;
      name: string;
      displayName: string;
      description?: string;
      priority?: number;
      permissions?: DomainPermission[];
    }>();

    if (!body.domainId || !body.name || !body.displayName) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing required fields: domainId, name, displayName' },
        400
      );
    }

    // Validate role name (alphanumeric, hyphens, underscores only)
    if (!/^[a-z0-9_-]+$/.test(body.name)) {
      return c.json(
        {
          error: 'InvalidRequest',
          message: 'Role name must be lowercase alphanumeric with hyphens or underscores only',
        },
        400
      );
    }

    // Validate permissions
    const validPermissions = DOMAIN_PERMISSION_DEFINITIONS.map((p) => p.id);
    const permissions = body.permissions || [];
    const invalidPermissions = permissions.filter((p) => !validPermissions.includes(p));

    if (invalidPermissions.length > 0) {
      return c.json(
        {
          error: 'InvalidRequest',
          message: `Invalid permissions: ${invalidPermissions.join(', ')}`,
        },
        400
      );
    }

    // Check for duplicate role name in domain
    const [existing] = await db
      .select()
      .from(domainRoles)
      .where(
        and(eq(domainRoles.domainId, body.domainId), eq(domainRoles.name, body.name))
      )
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: 'Conflict',
          message: 'A role with this name already exists in this domain',
        },
        409
      );
    }

    const id = nanoid();

    await db.insert(domainRoles).values({
      id,
      domainId: body.domainId,
      name: body.name,
      displayName: body.displayName,
      description: body.description,
      isSystem: false,
      priority: body.priority || 50,
      permissions: permissions,
    });

    await logAudit(
      adminUser.id,
      'domain_role_created',
      'domain_role',
      id,
      {
        domainId: body.domainId,
        name: body.name,
        permissions,
      },
      c
    );

    const [role] = await db
      .select()
      .from(domainRoles)
      .where(eq(domainRoles.id, id))
      .limit(1);

    return c.json({
      id: role!.id,
      domainId: role!.domainId,
      name: role!.name,
      displayName: role!.displayName,
      description: role!.description,
      isSystem: role!.isSystem,
      priority: role!.priority,
      permissions: role!.permissions || [],
      createdAt: role!.createdAt.toISOString(),
      updatedAt: role!.updatedAt.toISOString(),
    }, 201);
  }
);

/**
 * PUT /xrpc/io.exprsn.admin.domain.roles.update
 * Update a role
 */
adminDomainRolesRouter.put(
  '/io.exprsn.admin.domain.roles.update',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      roleId: string;
      displayName?: string;
      description?: string;
      priority?: number;
      permissions?: DomainPermission[];
    }>();

    if (!body.roleId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing roleId' }, 400);
    }

    // Check if role exists
    const [role] = await db
      .select()
      .from(domainRoles)
      .where(eq(domainRoles.id, body.roleId))
      .limit(1);

    if (!role) {
      return c.json({ error: 'NotFound', message: 'Role not found' }, 404);
    }

    // Cannot update system roles
    if (role.isSystem) {
      return c.json(
        { error: 'Forbidden', message: 'Cannot update system roles' },
        403
      );
    }

    // Validate permissions if provided
    if (body.permissions) {
      const validPermissions = DOMAIN_PERMISSION_DEFINITIONS.map((p) => p.id);
      const invalidPermissions = body.permissions.filter((p) => !validPermissions.includes(p));

      if (invalidPermissions.length > 0) {
        return c.json(
          {
            error: 'InvalidRequest',
            message: `Invalid permissions: ${invalidPermissions.join(', ')}`,
          },
          400
        );
      }
    }

    const updates: {
      displayName?: string;
      description?: string | null;
      priority?: number;
      permissions?: DomainPermission[];
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.permissions !== undefined) updates.permissions = body.permissions;

    await db.update(domainRoles).set(updates).where(eq(domainRoles.id, body.roleId));

    await logAudit(
      adminUser.id,
      'domain_role_updated',
      'domain_role',
      body.roleId,
      { changes: body },
      c
    );

    const [updated] = await db
      .select()
      .from(domainRoles)
      .where(eq(domainRoles.id, body.roleId))
      .limit(1);

    return c.json({
      id: updated!.id,
      domainId: updated!.domainId,
      name: updated!.name,
      displayName: updated!.displayName,
      description: updated!.description,
      isSystem: updated!.isSystem,
      priority: updated!.priority,
      permissions: updated!.permissions || [],
      createdAt: updated!.createdAt.toISOString(),
      updatedAt: updated!.updatedAt.toISOString(),
    });
  }
);

/**
 * DELETE /xrpc/io.exprsn.admin.domain.roles.delete
 * Delete a role (only non-system roles)
 */
adminDomainRolesRouter.delete(
  '/io.exprsn.admin.domain.roles.delete',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_MANAGE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const roleId = c.req.query('roleId');

    if (!roleId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing roleId' }, 400);
    }

    // Check if role exists
    const [role] = await db
      .select()
      .from(domainRoles)
      .where(eq(domainRoles.id, roleId))
      .limit(1);

    if (!role) {
      return c.json({ error: 'NotFound', message: 'Role not found' }, 404);
    }

    // Cannot delete system roles
    if (role.isSystem) {
      return c.json(
        { error: 'Forbidden', message: 'Cannot delete system roles' },
        403
      );
    }

    await db.delete(domainRoles).where(eq(domainRoles.id, roleId));

    await logAudit(
      adminUser.id,
      'domain_role_deleted',
      'domain_role',
      roleId,
      {
        domainId: role.domainId,
        name: role.name,
      },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * GET /xrpc/io.exprsn.admin.domain.permissions.catalog
 * Get all available permissions with metadata
 */
adminDomainRolesRouter.get(
  '/io.exprsn.admin.domain.permissions.catalog',
  requirePermission(ADMIN_PERMISSIONS.DOMAINS_VIEW),
  async (c) => {
    // Return permission definitions from shared package
    const permissions = DOMAIN_PERMISSION_DEFINITIONS.map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      category: def.category,
    }));

    // Group by category
    const categories = Object.values(DOMAIN_PERMISSION_CATEGORIES).map((category) => ({
      id: category,
      name: category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' '),
      permissions: permissions.filter((p) => p.category === category),
    }));

    return c.json({
      permissions,
      categories,
      total: permissions.length,
    });
  }
);

export default adminDomainRolesRouter;
