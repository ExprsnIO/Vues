import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  organizations,
  organizationMembers,
  organizationRoles,
  organizationFollows,
  organizationInvites,
  organizationBilling,
  organizationContentQueue,
  bulkImportJobs,
  users,
  videos,
  organizationTags,
  organizationMemberTags,
  organizationBlockedWords,
  organizationActivity,
  actorRepos,
  domains,
  domainInvites,
  domainUsers,
} from '../db/schema.js';
import {
  ORG_PERMISSIONS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
  type SystemRoleName,
  type OrgPermission,
  type OrganizationType,
} from '@exprsn/shared';
import { eq, and, desc, asc, sql, gte, count } from 'drizzle-orm';
import {
  createImportJob,
  generateCSVTemplate,
  generateXLSXTemplate,
} from '../services/bulk-import.js';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { ExprsnDidService } from '../services/did/index.js';

// Middleware type for authenticated requests
type AuthContext = {
  Variables: {
    did: string;
  };
};

export const organizationRoutes = new Hono<AuthContext>();

// Helper to check if user has permission in organization
type OrgPermissionResult = {
  member: typeof organizationMembers.$inferSelect;
  org: {
    id: string;
    ownerDid: string;
    name: string;
    type: string;
  };
};

async function checkOrgPermission(
  userDid: string,
  organizationId: string,
  requiredPermission?: string
): Promise<OrgPermissionResult | null> {
  const result = await db
    .select({
      member: organizationMembers,
      org: {
        id: organizations.id,
        ownerDid: organizations.ownerDid,
        name: organizations.name,
        type: organizations.type,
      },
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userDid, userDid)
      )
    )
    .limit(1);

  const data = result[0];
  if (!data) return null;

  // Owner has all permissions
  if (data.member.role === 'owner') {
    return data;
  }

  // Check specific permission if required
  if (requiredPermission) {
    const permissions = (data.member.permissions as string[]) || [];
    if (!permissions.includes(requiredPermission)) {
      return null;
    }
  }

  return data;
}

// ============================================
// Organization Management
// ============================================

// Create organization
organizationRoutes.post('/io.exprsn.org.create', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    name: string;
    type: 'team' | 'enterprise' | 'nonprofit' | 'business' | 'company' | 'network' | 'label' | 'brand' | 'channel';
    description?: string;
    website?: string;
  }>();

  if (!body.name || body.name.length < 2 || body.name.length > 100) {
    throw new HTTPException(400, { message: 'Organization name must be 2-100 characters' });
  }

  const validTypes = ['team', 'enterprise', 'nonprofit', 'business', 'company', 'network', 'label', 'brand', 'channel'];
  if (!validTypes.includes(body.type)) {
    throw new HTTPException(400, { message: 'Invalid organization type' });
  }

  const orgId = nanoid();
  const now = new Date();

  // Create organization
  await db.insert(organizations).values({
    id: orgId,
    ownerDid: userDid,
    name: body.name,
    type: body.type,
    description: body.description,
    website: body.website,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Create system roles for the organization
  const systemRoleNames = Object.keys(SYSTEM_ROLES) as SystemRoleName[];
  const roleIdMap: Record<string, string> = {};

  for (const roleName of systemRoleNames) {
    const roleConfig = SYSTEM_ROLES[roleName];
    const permissions = SYSTEM_ROLE_PERMISSIONS[roleName];
    const roleId = nanoid();
    roleIdMap[roleName] = roleId;

    await db.insert(organizationRoles).values({
      id: roleId,
      organizationId: orgId,
      name: roleName,
      displayName: roleConfig.displayName,
      description: roleConfig.description,
      permissions: permissions,
      priority: roleConfig.priority,
      color: roleConfig.color,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Add owner as member with roleId reference
  await db.insert(organizationMembers).values({
    id: nanoid(),
    organizationId: orgId,
    userDid,
    role: 'owner',
    roleId: roleIdMap['owner'],
    permissions: SYSTEM_ROLE_PERMISSIONS['owner'],
    joinedAt: now,
  });

  // Create intermediate CA for qualifying organization types
  // Enterprise, agency, network, label, and brand orgs get their own CA
  let intermediateCaCreated = false;
  if (ExprsnDidService.shouldCreateIntermediateCA(body.type as OrganizationType)) {
    try {
      await ExprsnDidService.createOrganizationCA({
        organizationId: orgId,
        organizationName: body.name,
        organizationType: body.type as OrganizationType,
      });
      intermediateCaCreated = true;
    } catch (error) {
      // Log but don't fail - CA can be created later
      console.error('Failed to create organization intermediate CA:', error);
    }
  }

  // If owner has a did:exprsn, link them to this organization
  try {
    const ownerAccount = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, userDid))
      .limit(1);

    if (ownerAccount[0]?.didMethod === 'exprn') {
      await ExprsnDidService.upgradeToOrgCertificate(userDid, orgId);
    }
  } catch (error) {
    // Non-fatal - owner certificate upgrade can happen later
    console.error('Failed to upgrade owner to org certificate:', error);
  }

  return c.json({
    organization: {
      id: orgId,
      name: body.name,
      type: body.type,
      description: body.description || null,
      website: body.website || null,
      avatar: null,
      memberCount: 1,
      role: 'owner',
      createdAt: now.toISOString(),
      hasIntermediateCA: intermediateCaCreated,
    },
  });
});

// Get organization
organizationRoutes.get('/io.exprsn.org.get', optionalAuthMiddleware, async (c) => {
  const userDid = c.get('did');
  const orgId = c.req.query('id');

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Select only columns that exist in the database
  const result = await db
    .select({
      id: organizations.id,
      ownerDid: organizations.ownerDid,
      name: organizations.name,
      type: organizations.type,
      description: organizations.description,
      website: organizations.website,
      avatar: organizations.avatar,
      verified: organizations.verified,
      memberCount: organizations.memberCount,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const org = result[0];
  if (!org) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  // Get viewer's membership if authenticated
  let viewerMembership = null;
  if (userDid) {
    const memberResult = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userDid, userDid)
        )
      )
      .limit(1);
    viewerMembership = memberResult[0] || null;
  }

  // Get owner info
  const ownerResult = await db
    .select({
      did: users.did,
      handle: users.handle,
      displayName: users.displayName,
      avatar: users.avatar,
    })
    .from(users)
    .where(eq(users.did, org.ownerDid))
    .limit(1);

  return c.json({
    organization: {
      id: org.id,
      name: org.name,
      type: org.type,
      description: org.description,
      website: org.website,
      avatar: org.avatar,
      verified: org.verified,
      memberCount: org.memberCount,
      createdAt: org.createdAt.toISOString(),
      owner: ownerResult[0] || null,
    },
    viewer: viewerMembership
      ? {
          role: viewerMembership.role,
          permissions: viewerMembership.permissions,
          joinedAt: viewerMembership.joinedAt.toISOString(),
        }
      : null,
  });
});

// Update organization
organizationRoutes.post('/io.exprsn.org.update', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    id: string;
    name?: string;
    description?: string;
    website?: string;
    avatar?: string;
  }>();

  if (!body.id) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.id, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Update organization
  const updates: Partial<typeof organizations.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    if (body.name.length < 2 || body.name.length > 100) {
      throw new HTTPException(400, { message: 'Organization name must be 2-100 characters' });
    }
    updates.name = body.name;
  }
  if (body.description !== undefined) updates.description = body.description;
  if (body.website !== undefined) updates.website = body.website;
  if (body.avatar !== undefined) updates.avatar = body.avatar;

  await db
    .update(organizations)
    .set(updates)
    .where(eq(organizations.id, body.id));

  return c.json({ success: true });
});

// Complete organization setup (onboarding wizard)
organizationRoutes.post('/io.exprsn.org.setup', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    hostingType: 'cloud' | 'self-hosted' | 'hybrid';
    plcProvider: 'exprsn' | 'bluesky' | 'self-hosted';
    selfHostedPlcUrl?: string;
    customDomain?: string;
    handleSuffix?: string;
    initialMembers?: Array<{
      email: string;
      role: 'admin' | 'moderator' | 'member';
      name?: string;
    }>;
    roles?: Array<{
      name: string;
      displayName: string;
      permissions: string[];
      color: string;
    }>;
    groups?: Array<{
      name: string;
      description?: string;
    }>;
    federationEnabled: boolean;
    federationSettings?: {
      inboundEnabled: boolean;
      outboundEnabled: boolean;
      allowedDomains: string[];
      blockedDomains: string[];
      syncPosts: boolean;
      syncLikes: boolean;
      syncFollows: boolean;
    };
    moderationSettings?: {
      autoModerationEnabled: boolean;
      aiModerationEnabled: boolean;
      requireReviewNewUsers: boolean;
      newUserReviewDays: number;
      shadowBanEnabled: boolean;
      appealEnabled: boolean;
      contentPolicies: string[];
    };
  }>();

  const orgId = body.organizationId;
  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check admin permission
  const access = await checkOrgPermission(userDid, orgId, 'admin');
  if (!access) {
    throw new HTTPException(403, { message: 'Admin permission required' });
  }

  let membersInvited = 0;
  let rolesCreated = 0;
  let groupsCreated = 0;

  // Update organization settings
  const settingsUpdate: Record<string, unknown> = {
    updatedAt: new Date(),
    hostingType: body.hostingType,
    plcProvider: body.plcProvider,
    federationEnabled: body.federationEnabled,
  };

  if (body.selfHostedPlcUrl) {
    settingsUpdate.selfHostedPlcUrl = body.selfHostedPlcUrl;
  }
  if (body.customDomain) {
    settingsUpdate.customDomain = body.customDomain;
  }
  if (body.handleSuffix) {
    settingsUpdate.handleSuffix = body.handleSuffix;
  }
  if (body.federationSettings) {
    settingsUpdate.federationConfig = JSON.stringify(body.federationSettings);
  }
  if (body.moderationSettings) {
    settingsUpdate.moderationConfig = JSON.stringify(body.moderationSettings);
  }

  await db
    .update(organizations)
    .set(settingsUpdate)
    .where(eq(organizations.id, orgId));

  // Create custom roles
  if (body.roles && body.roles.length > 0) {
    for (const role of body.roles) {
      try {
        await db.insert(organizationRoles).values({
          id: nanoid(),
          organizationId: orgId,
          name: role.name,
          displayName: role.displayName,
          permissions: role.permissions as OrgPermission[],
          color: role.color,
          isSystem: false,
          priority: rolesCreated + 10, // After system roles
        });
        rolesCreated++;
      } catch (e) {
        console.warn('Failed to create role:', role.name, e);
      }
    }
  }

  // Create groups using organizationTags table with type='group'
  if (body.groups && body.groups.length > 0) {
    for (const group of body.groups) {
      try {
        await db.insert(organizationTags).values({
          id: nanoid(),
          organizationId: orgId,
          name: group.name,
          color: group.color || '#6366f1',
          description: group.description,
          type: 'group',
          createdBy: userDid,
        });
        groupsCreated++;
      } catch (e) {
        console.warn('Failed to create group:', group.name, e);
      }
    }
  }

  // Invite initial members
  if (body.initialMembers && body.initialMembers.length > 0) {
    for (const member of body.initialMembers) {
      try {
        // Create invite
        const inviteId = nanoid();
        const inviteCode = nanoid(12);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db.insert(organizationInvites).values({
          id: inviteId,
          organizationId: orgId,
          email: member.email.toLowerCase(),
          roleName: member.role === 'moderator' ? 'moderator' : member.role,
          invitedBy: userDid,
          token: inviteCode,
          expiresAt,
          status: 'pending',
        });

        // TODO: Send invite email via email service
        // await sendInviteEmail(member.email, inviteCode, orgName);

        membersInvited++;
      } catch (e) {
        console.warn('Failed to invite member:', member.email, e);
      }
    }
  }

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: orgId,
    actorDid: userDid,
    type: 'organization_setup',
    metadata: JSON.stringify({
      hostingType: body.hostingType,
      plcProvider: body.plcProvider,
      federationEnabled: body.federationEnabled,
      membersInvited,
      rolesCreated,
      groupsCreated,
    }),
    createdAt: new Date(),
  });

  // Get updated organization
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  return c.json({
    organization: org ? {
      id: org.id,
      name: org.name,
      type: org.type,
      avatar: org.avatar,
      memberCount: org.memberCount,
    } : null,
    setup: {
      membersInvited,
      rolesCreated,
      groupsCreated,
    },
  });
});

// List user's organizations
organizationRoutes.get('/io.exprsn.org.list', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const result = await db
    .select({
      // Select only columns that exist in the database
      org: {
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        description: organizations.description,
        avatar: organizations.avatar,
        memberCount: organizations.memberCount,
        verified: organizations.verified,
      },
      member: organizationMembers,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userDid, userDid))
    .orderBy(desc(organizationMembers.joinedAt));

  return c.json({
    organizations: result.map(({ org, member }) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      description: org.description,
      avatar: org.avatar,
      memberCount: org.memberCount,
      verified: org.verified,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      viewer: {
        role: member.role,
        permissions: member.permissions,
      },
    })),
  });
});

// ============================================
// Member Management
// ============================================

// List organization members
organizationRoutes.get('/io.exprsn.org.members.list', authMiddleware, async (c) => {
  const userDid = c.get('did');

  const orgId = c.req.query('id') || c.req.query('organizationId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const cursor = c.req.query('cursor');

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check if user is a member
  const access = await checkOrgPermission(userDid, orgId);
  if (!access) {
    throw new HTTPException(403, { message: 'Not a member of this organization' });
  }

  let query = db
    .select({
      member: organizationMembers,
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.did, organizationMembers.userDid))
    .where(eq(organizationMembers.organizationId, orgId))
    .orderBy(desc(organizationMembers.joinedAt))
    .limit(limit + 1);

  if (cursor) {
    // @ts-expect-error - Drizzle query chaining type issue
    query = query.where(
      and(
        eq(organizationMembers.organizationId, orgId),
        sql`${organizationMembers.joinedAt} < ${new Date(cursor)}`
      )
    ) as typeof query;
  }

  const results = await query;
  const hasMore = results.length > limit;
  const members = hasMore ? results.slice(0, -1) : results;

  return c.json({
    members: members.map(({ member, user }) => ({
      id: member.id,
      user,
      role: member.role,
      permissions: member.permissions,
      joinedAt: member.joinedAt.toISOString(),
    })),
    cursor: hasMore ? members[members.length - 1]?.member.joinedAt.toISOString() : undefined,
  });
});

// Invite member to organization
organizationRoutes.post('/io.exprsn.org.members.invite', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    userDid: string;
    role?: 'admin' | 'member';
  }>();

  if (!body.organizationId || !body.userDid) {
    throw new HTTPException(400, { message: 'Organization ID and user DID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Check if user exists
  const userResult = await db
    .select()
    .from(users)
    .where(eq(users.did, body.userDid))
    .limit(1);

  if (!userResult[0]) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Check if already a member
  const existingMember = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, body.organizationId),
        eq(organizationMembers.userDid, body.userDid)
      )
    )
    .limit(1);

  if (existingMember[0]) {
    throw new HTTPException(409, { message: 'User is already a member' });
  }

  const role = body.role || 'member';
  const permissions = role === 'admin' ? ['bulk_import', 'manage_members', 'edit_settings'] : [];

  // Add member
  await db.insert(organizationMembers).values({
    id: nanoid(),
    organizationId: body.organizationId,
    userDid: body.userDid,
    role,
    permissions,
    invitedBy: userDid,
    joinedAt: new Date(),
  });

  // Update member count
  await db
    .update(organizations)
    .set({
      memberCount: sql`${organizations.memberCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, body.organizationId));

  return c.json({ success: true });
});

// Update member role
organizationRoutes.post('/io.exprsn.org.members.updateRole', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    memberDid: string;
    role: 'admin' | 'member';
  }>();

  if (!body.organizationId || !body.memberDid || !body.role) {
    throw new HTTPException(400, { message: 'Missing required fields' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Can't change owner's role
  if (access.org.ownerDid === body.memberDid) {
    throw new HTTPException(400, { message: 'Cannot change owner role' });
  }

  const permissions = body.role === 'admin' ? ['bulk_import', 'manage_members', 'edit_settings'] : [];

  await db
    .update(organizationMembers)
    .set({ role: body.role, permissions })
    .where(
      and(
        eq(organizationMembers.organizationId, body.organizationId),
        eq(organizationMembers.userDid, body.memberDid)
      )
    );

  return c.json({ success: true });
});

// Remove member from organization
organizationRoutes.post('/io.exprsn.org.members.remove', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    memberDid: string;
  }>();

  if (!body.organizationId || !body.memberDid) {
    throw new HTTPException(400, { message: 'Missing required fields' });
  }

  // Check permission (or user removing themselves)
  const access = await checkOrgPermission(userDid, body.organizationId);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Can remove self, or need manage_members permission
  if (body.memberDid !== userDid) {
    const permissions = (access.member.permissions as string[]) || [];
    if (access.member.role !== 'owner' && !permissions.includes('manage_members')) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
  }

  // Can't remove owner
  if (access.org.ownerDid === body.memberDid) {
    throw new HTTPException(400, { message: 'Cannot remove organization owner' });
  }

  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, body.organizationId),
        eq(organizationMembers.userDid, body.memberDid)
      )
    );

  // Update member count
  await db
    .update(organizations)
    .set({
      memberCount: sql`${organizations.memberCount} - 1`,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, body.organizationId));

  return c.json({ success: true });
});

// ============================================
// Bulk Import
// ============================================

// Upload file for bulk import
organizationRoutes.post('/io.exprsn.org.import.upload', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const formData = await c.req.formData();
  const organizationId = formData.get('organizationId') as string;
  const file = formData.get('file') as File;

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  if (!file) {
    throw new HTTPException(400, { message: 'File required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, organizationId, 'bulk_import');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Determine file type
  const fileName = file.name.toLowerCase();
  let fileType: 'xlsx' | 'csv' | 'sqlite';

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    fileType = 'xlsx';
  } else if (fileName.endsWith('.csv')) {
    fileType = 'csv';
  } else if (fileName.endsWith('.db') || fileName.endsWith('.sqlite') || fileName.endsWith('.sqlite3')) {
    fileType = 'sqlite';
  } else {
    throw new HTTPException(400, { message: 'Unsupported file type. Use XLSX, CSV, or SQLite.' });
  }

  // Read file buffer
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const { jobId, totalRows } = await createImportJob(organizationId, userDid, {
      buffer,
      type: fileType,
      name: file.name,
      size: file.size,
    });

    return c.json({
      jobId,
      totalRows,
      status: 'pending',
    });
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : 'Failed to process file',
    });
  }
});

// Get import job status
organizationRoutes.get('/io.exprsn.org.import.status', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const jobId = c.req.query('jobId');
  if (!jobId) {
    throw new HTTPException(400, { message: 'Job ID required' });
  }

  const result = await db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.id, jobId))
    .limit(1);

  const job = result[0];
  if (!job) {
    throw new HTTPException(404, { message: 'Import job not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, job.organizationId);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  return c.json({
    jobId: job.id,
    status: job.status,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    successCount: job.successCount,
    errorCount: job.errorCount,
    errors: job.errors,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
  });
});

// List import jobs for organization
organizationRoutes.get('/io.exprsn.org.import.list', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const organizationId = c.req.query('organizationId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, organizationId);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const jobs = await db
    .select({
      job: bulkImportJobs,
      createdBy: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
      },
    })
    .from(bulkImportJobs)
    .leftJoin(users, eq(users.did, bulkImportJobs.createdBy))
    .where(eq(bulkImportJobs.organizationId, organizationId))
    .orderBy(desc(bulkImportJobs.createdAt))
    .limit(limit);

  return c.json({
    jobs: jobs.map(({ job, createdBy }) => ({
      id: job.id,
      fileName: job.fileName,
      fileType: job.fileType,
      status: job.status,
      totalRows: job.totalRows,
      successCount: job.successCount,
      errorCount: job.errorCount,
      createdBy,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    })),
  });
});

// Download import template
organizationRoutes.get('/io.exprsn.org.import.template', authMiddleware, async (c) => {
  const format = c.req.query('format') || 'csv';

  if (format === 'xlsx') {
    const buffer = generateXLSXTemplate();
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="import-template.xlsx"',
      },
    });
  }

  const csv = generateCSVTemplate();
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="import-template.csv"',
    },
  });
});

// Cancel import job
organizationRoutes.post('/io.exprsn.org.import.cancel', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ jobId: string }>();
  if (!body.jobId) {
    throw new HTTPException(400, { message: 'Job ID required' });
  }

  const result = await db
    .select()
    .from(bulkImportJobs)
    .where(eq(bulkImportJobs.id, body.jobId))
    .limit(1);

  const job = result[0];
  if (!job) {
    throw new HTTPException(404, { message: 'Import job not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, job.organizationId, 'bulk_import');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  if (job.status === 'completed' || job.status === 'failed') {
    throw new HTTPException(400, { message: 'Job already finished' });
  }

  await db
    .update(bulkImportJobs)
    .set({
      status: 'cancelled',
      completedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, body.jobId));

  return c.json({ success: true });
});

// ============================================
// Member Management - Extended
// ============================================

// Update member profile (by admin)
organizationRoutes.post('/io.exprsn.org.members.update', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    memberId: string;
    displayName?: string;
    bio?: string;
    avatar?: string;
  }>();

  if (!body.organizationId || !body.memberId) {
    throw new HTTPException(400, { message: 'Organization ID and member ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Get member info
  const memberResult = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.id, body.memberId))
    .limit(1);

  const member = memberResult[0];
  if (!member || member.organizationId !== body.organizationId) {
    throw new HTTPException(404, { message: 'Member not found' });
  }

  // Update the user profile
  const updates: Record<string, unknown> = {};
  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.bio !== undefined) updates.bio = body.bio;
  if (body.avatar !== undefined) updates.avatar = body.avatar;

  if (Object.keys(updates).length > 0) {
    await db
      .update(users)
      .set(updates)
      .where(eq(users.did, member.userDid));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId: body.organizationId,
      actorDid: userDid,
      action: 'member_updated',
      targetType: 'member',
      targetId: body.memberId,
      details: { updates: Object.keys(updates) },
    });
  }

  return c.json({ success: true });
});

// Reset member password
organizationRoutes.post('/io.exprsn.org.members.resetPassword', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    memberId: string;
    newPassword?: string;
  }>();

  if (!body.organizationId || !body.memberId) {
    throw new HTTPException(400, { message: 'Organization ID and member ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Get member info
  const memberResult = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.id, body.memberId))
    .limit(1);

  const member = memberResult[0];
  if (!member || member.organizationId !== body.organizationId) {
    throw new HTTPException(404, { message: 'Member not found' });
  }

  // Generate or use provided password
  const newPassword = body.newPassword || nanoid(12);
  const passwordHash = await bcrypt.hash(newPassword, 10);

  // Update actor_repos password
  await db
    .update(actorRepos)
    .set({ passwordHash })
    .where(eq(actorRepos.did, member.userDid));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: body.organizationId,
    actorDid: userDid,
    action: 'password_reset',
    targetType: 'member',
    targetId: body.memberId,
  });

  return c.json({
    success: true,
    temporaryPassword: body.newPassword ? undefined : newPassword,
  });
});

// Suspend/activate member
organizationRoutes.post('/io.exprsn.org.members.suspend', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    memberId: string;
    suspended: boolean;
    reason?: string;
  }>();

  if (!body.organizationId || !body.memberId || body.suspended === undefined) {
    throw new HTTPException(400, { message: 'Missing required fields' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Get member info
  const memberResult = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.id, body.memberId))
    .limit(1);

  const member = memberResult[0];
  if (!member || member.organizationId !== body.organizationId) {
    throw new HTTPException(404, { message: 'Member not found' });
  }

  // Can't suspend owner
  if (member.role === 'owner') {
    throw new HTTPException(400, { message: 'Cannot suspend organization owner' });
  }

  // Update member status
  await db
    .update(organizationMembers)
    .set({
      status: body.suspended ? 'suspended' : 'active',
      suspendedAt: body.suspended ? new Date() : null,
      suspendedBy: body.suspended ? userDid : null,
      suspendedReason: body.suspended ? body.reason : null,
    })
    .where(eq(organizationMembers.id, body.memberId));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: body.organizationId,
    actorDid: userDid,
    action: body.suspended ? 'member_suspended' : 'member_activated',
    targetType: 'member',
    targetId: body.memberId,
    details: body.reason ? { reason: body.reason } : undefined,
  });

  return c.json({ success: true });
});

// Reorder members
organizationRoutes.post('/io.exprsn.org.members.reorder', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    memberIds: string[];
  }>();

  if (!body.organizationId || !body.memberIds?.length) {
    throw new HTTPException(400, { message: 'Organization ID and member IDs required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Update display order for each member
  for (let i = 0; i < body.memberIds.length; i++) {
    const memberId = body.memberIds[i];
    if (!memberId) continue;
    await db
      .update(organizationMembers)
      .set({ displayOrder: i })
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, body.organizationId)
        )
      );
  }

  return c.json({ success: true });
});

// Export members to CSV/XLSX
organizationRoutes.get('/io.exprsn.org.members.export', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const organizationId = c.req.query('organizationId');
  const format = c.req.query('format') || 'csv';

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, organizationId);
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Get all members
  const members = await db
    .select({
      member: organizationMembers,
      user: users,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.did, organizationMembers.userDid))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(asc(organizationMembers.displayOrder));

  // Format data for export
  const exportData = members.map(({ member, user }) => ({
    handle: user.handle,
    displayName: user.displayName || '',
    email: '', // Don't export email for privacy
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt.toISOString(),
  }));

  if (format === 'xlsx') {
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="members.xlsx"',
      },
    });
  }

  // CSV format
  const headers = ['handle', 'displayName', 'email', 'role', 'status', 'joinedAt'];
  const csvRows = [headers.join(',')];
  for (const row of exportData) {
    csvRows.push(headers.map(h => `"${String(row[h as keyof typeof row]).replace(/"/g, '""')}"`).join(','));
  }

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="members.csv"',
    },
  });
});

// ============================================
// Tag Management
// ============================================

// List organization tags
organizationRoutes.get('/io.exprsn.org.tags.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  const tags = await db
    .select({
      tag: organizationTags,
      memberCount: sql<number>`(SELECT COUNT(*) FROM organization_member_tags WHERE tag_id = ${organizationTags.id})`,
    })
    .from(organizationTags)
    .where(eq(organizationTags.organizationId, organizationId))
    .orderBy(asc(organizationTags.name));

  return c.json({
    tags: tags.map(({ tag, memberCount }) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      description: tag.description,
      memberCount,
      createdAt: tag.createdAt.toISOString(),
    })),
  });
});

// Create tag
organizationRoutes.post('/io.exprsn.org.tags.create', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    name: string;
    color: string;
    description?: string;
  }>();

  if (!body.organizationId || !body.name || !body.color) {
    throw new HTTPException(400, { message: 'Organization ID, name, and color required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const tagId = nanoid();

  await db.insert(organizationTags).values({
    id: tagId,
    organizationId: body.organizationId,
    name: body.name.trim(),
    color: body.color,
    description: body.description,
    createdBy: userDid,
  });

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: body.organizationId,
    actorDid: userDid,
    action: 'tag_created',
    targetType: 'tag',
    targetId: tagId,
    details: { name: body.name },
  });

  return c.json({
    tag: {
      id: tagId,
      name: body.name.trim(),
      color: body.color,
      description: body.description,
      memberCount: 0,
    },
  });
});

// Update tag
organizationRoutes.post('/io.exprsn.org.tags.update', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    tagId: string;
    name?: string;
    color?: string;
    description?: string;
  }>();

  if (!body.tagId) {
    throw new HTTPException(400, { message: 'Tag ID required' });
  }

  // Get tag to find organization
  const tagResult = await db
    .select()
    .from(organizationTags)
    .where(eq(organizationTags.id, body.tagId))
    .limit(1);

  const tag = tagResult[0];
  if (!tag) {
    throw new HTTPException(404, { message: 'Tag not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, tag.organizationId, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.color !== undefined) updates.color = body.color;
  if (body.description !== undefined) updates.description = body.description;

  await db
    .update(organizationTags)
    .set(updates)
    .where(eq(organizationTags.id, body.tagId));

  return c.json({ success: true });
});

// Delete tag
organizationRoutes.post('/io.exprsn.org.tags.delete', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ tagId: string }>();

  if (!body.tagId) {
    throw new HTTPException(400, { message: 'Tag ID required' });
  }

  // Get tag to find organization
  const tagResult = await db
    .select()
    .from(organizationTags)
    .where(eq(organizationTags.id, body.tagId))
    .limit(1);

  const tag = tagResult[0];
  if (!tag) {
    throw new HTTPException(404, { message: 'Tag not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, tag.organizationId, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Delete tag (cascade will remove member tags)
  await db.delete(organizationTags).where(eq(organizationTags.id, body.tagId));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: tag.organizationId,
    actorDid: userDid,
    action: 'tag_deleted',
    targetType: 'tag',
    targetId: body.tagId,
    details: { name: tag.name },
  });

  return c.json({ success: true });
});

// Assign tag to member
organizationRoutes.post('/io.exprsn.org.members.assignTag', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    memberId: string;
    tagId: string;
  }>();

  if (!body.organizationId || !body.memberId || !body.tagId) {
    throw new HTTPException(400, { message: 'Organization ID, member ID, and tag ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Check if already assigned
  const existing = await db
    .select()
    .from(organizationMemberTags)
    .where(
      and(
        eq(organizationMemberTags.memberId, body.memberId),
        eq(organizationMemberTags.tagId, body.tagId)
      )
    )
    .limit(1);

  if (existing[0]) {
    return c.json({ success: true, alreadyAssigned: true });
  }

  await db.insert(organizationMemberTags).values({
    id: nanoid(),
    memberId: body.memberId,
    tagId: body.tagId,
    assignedBy: userDid,
  });

  return c.json({ success: true });
});

// Remove tag from member
organizationRoutes.post('/io.exprsn.org.members.removeTag', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    memberId: string;
    tagId: string;
  }>();

  if (!body.memberId || !body.tagId) {
    throw new HTTPException(400, { message: 'Member ID and tag ID required' });
  }

  // Get member to find organization
  const memberResult = await db
    .select()
    .from(organizationMembers)
    .where(eq(organizationMembers.id, body.memberId))
    .limit(1);

  const member = memberResult[0];
  if (!member) {
    throw new HTTPException(404, { message: 'Member not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, member.organizationId, 'manage_members');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await db
    .delete(organizationMemberTags)
    .where(
      and(
        eq(organizationMemberTags.memberId, body.memberId),
        eq(organizationMemberTags.tagId, body.tagId)
      )
    );

  return c.json({ success: true });
});

// ============================================
// Blocked Words Management
// ============================================

// List blocked words
organizationRoutes.get('/io.exprsn.org.blockedWords.list', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  const words = await db
    .select()
    .from(organizationBlockedWords)
    .where(eq(organizationBlockedWords.organizationId, organizationId))
    .orderBy(asc(organizationBlockedWords.word));

  return c.json({
    words: words.map(w => ({
      id: w.id,
      word: w.word,
      severity: w.severity,
      enabled: w.enabled,
      createdAt: w.createdAt.toISOString(),
    })),
  });
});

// Add blocked word
organizationRoutes.post('/io.exprsn.org.blockedWords.add', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    word: string;
    severity: 'low' | 'medium' | 'high';
  }>();

  if (!body.organizationId || !body.word) {
    throw new HTTPException(400, { message: 'Organization ID and word required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const wordId = nanoid();

  try {
    await db.insert(organizationBlockedWords).values({
      id: wordId,
      organizationId: body.organizationId,
      word: body.word.toLowerCase().trim(),
      severity: body.severity || 'medium',
      createdBy: userDid,
    });
  } catch {
    throw new HTTPException(409, { message: 'Word already exists' });
  }

  return c.json({
    word: {
      id: wordId,
      word: body.word.toLowerCase().trim(),
      severity: body.severity || 'medium',
      enabled: true,
    },
  });
});

// Update blocked word
organizationRoutes.post('/io.exprsn.org.blockedWords.update', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    id: string;
    enabled?: boolean;
    severity?: 'low' | 'medium' | 'high';
  }>();

  if (!body.id) {
    throw new HTTPException(400, { message: 'Word ID required' });
  }

  // Get word to find organization
  const wordResult = await db
    .select()
    .from(organizationBlockedWords)
    .where(eq(organizationBlockedWords.id, body.id))
    .limit(1);

  const word = wordResult[0];
  if (!word) {
    throw new HTTPException(404, { message: 'Word not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, word.organizationId, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const updates: Record<string, unknown> = {};
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.severity !== undefined) updates.severity = body.severity;

  await db
    .update(organizationBlockedWords)
    .set(updates)
    .where(eq(organizationBlockedWords.id, body.id));

  return c.json({ success: true });
});

// Remove blocked word
organizationRoutes.post('/io.exprsn.org.blockedWords.remove', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ id: string }>();

  if (!body.id) {
    throw new HTTPException(400, { message: 'Word ID required' });
  }

  // Get word to find organization
  const wordResult = await db
    .select()
    .from(organizationBlockedWords)
    .where(eq(organizationBlockedWords.id, body.id))
    .limit(1);

  const word = wordResult[0];
  if (!word) {
    throw new HTTPException(404, { message: 'Word not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, word.organizationId, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await db.delete(organizationBlockedWords).where(eq(organizationBlockedWords.id, body.id));

  return c.json({ success: true });
});

// Import blocked words (bulk)
organizationRoutes.post('/io.exprsn.org.blockedWords.import', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    words: string[];
    severity: 'low' | 'medium' | 'high';
  }>();

  if (!body.organizationId || !body.words?.length) {
    throw new HTTPException(400, { message: 'Organization ID and words required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId, 'edit_settings');
  if (!access) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  let imported = 0;
  for (const word of body.words) {
    const trimmed = word.toLowerCase().trim();
    if (!trimmed) continue;

    try {
      await db.insert(organizationBlockedWords).values({
        id: nanoid(),
        organizationId: body.organizationId,
        word: trimmed,
        severity: body.severity || 'medium',
        createdBy: userDid,
      });
      imported++;
    } catch {
      // Ignore duplicates
    }
  }

  return c.json({ imported });
});

// Export blocked words
organizationRoutes.get('/io.exprsn.org.blockedWords.export', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  const format = c.req.query('format') || 'txt';

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  const words = await db
    .select()
    .from(organizationBlockedWords)
    .where(eq(organizationBlockedWords.organizationId, organizationId))
    .orderBy(asc(organizationBlockedWords.word));

  if (format === 'json') {
    return c.json({
      words: words.map(w => ({
        word: w.word,
        severity: w.severity,
        enabled: w.enabled,
      })),
    });
  }

  // TXT format - one word per line
  const content = words.map(w => w.word).join('\n');
  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': 'attachment; filename="blocked-words.txt"',
    },
  });
});

// ============================================
// Statistics & Activity
// ============================================

// Get organization statistics
organizationRoutes.get('/io.exprsn.org.stats', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Get member stats
  const memberStats = await db
    .select({
      total: count(),
      active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
      suspended: sql<number>`COUNT(*) FILTER (WHERE status = 'suspended')`,
    })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId));

  // Get role distribution
  const roleDistribution = await db
    .select({
      role: organizationMembers.role,
      count: count(),
    })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, organizationId))
    .groupBy(organizationMembers.role);

  // Get recent imports
  const recentImports = await db
    .select({
      date: sql<string>`DATE(created_at)`,
      count: count(),
      successCount: sql<number>`SUM(success_count)`,
    })
    .from(bulkImportJobs)
    .where(
      and(
        eq(bulkImportJobs.organizationId, organizationId),
        gte(bulkImportJobs.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`);

  // Get member growth (last 30 days)
  const memberGrowth = await db
    .select({
      date: sql<string>`DATE(joined_at)`,
      count: count(),
    })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        gte(organizationMembers.joinedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .groupBy(sql`DATE(joined_at)`)
    .orderBy(sql`DATE(joined_at)`);

  return c.json({
    memberCount: memberStats[0]?.total || 0,
    activeMembers: memberStats[0]?.active || 0,
    suspendedMembers: memberStats[0]?.suspended || 0,
    membersByRole: roleDistribution.map(r => ({
      role: r.role,
      count: r.count,
    })),
    memberGrowth: memberGrowth.map(g => ({
      date: g.date,
      count: g.count,
    })),
    recentImports: recentImports.map(i => ({
      date: i.date,
      count: i.count,
      successCount: i.successCount || 0,
    })),
  });
});

// Get organization activity feed
organizationRoutes.get('/io.exprsn.org.activity', authMiddleware, async (c) => {
  const organizationId = c.req.query('organizationId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  const cursor = c.req.query('cursor');

  if (!organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  let query = db
    .select({
      activity: organizationActivity,
      actor: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(organizationActivity)
    .innerJoin(users, eq(users.did, organizationActivity.actorDid))
    .where(eq(organizationActivity.organizationId, organizationId))
    .orderBy(desc(organizationActivity.createdAt))
    .limit(limit + 1);

  if (cursor) {
    // @ts-expect-error - Drizzle query chaining type issue
    query = query.where(
      and(
        eq(organizationActivity.organizationId, organizationId),
        sql`${organizationActivity.createdAt} < ${new Date(cursor)}`
      )
    ) as typeof query;
  }

  const results = await query;
  const hasMore = results.length > limit;
  const activities = hasMore ? results.slice(0, -1) : results;

  return c.json({
    activities: activities.map(({ activity, actor }) => ({
      id: activity.id,
      action: activity.action,
      targetType: activity.targetType,
      targetId: activity.targetId,
      details: activity.details,
      actor,
      createdAt: activity.createdAt.toISOString(),
    })),
    cursor: hasMore ? activities[activities.length - 1]?.activity.createdAt.toISOString() : undefined,
  });
});

// ============================================
// Danger Zone
// ============================================

// Transfer ownership
organizationRoutes.post('/io.exprsn.org.transferOwnership', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    newOwnerDid: string;
  }>();

  if (!body.organizationId || !body.newOwnerDid) {
    throw new HTTPException(400, { message: 'Organization ID and new owner DID required' });
  }

  // Get organization
  const orgResult = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, body.organizationId))
    .limit(1);

  const org = orgResult[0];
  if (!org) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  // Only current owner can transfer
  if (org.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Only the owner can transfer ownership' });
  }

  // Check new owner is a member
  const newOwnerMember = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, body.organizationId),
        eq(organizationMembers.userDid, body.newOwnerDid)
      )
    )
    .limit(1);

  if (!newOwnerMember[0]) {
    throw new HTTPException(400, { message: 'New owner must be a member of the organization' });
  }

  // Transfer ownership
  await db
    .update(organizations)
    .set({ ownerDid: body.newOwnerDid, updatedAt: new Date() })
    .where(eq(organizations.id, body.organizationId));

  // Update old owner to admin
  await db
    .update(organizationMembers)
    .set({
      role: 'admin',
      permissions: ['bulk_import', 'manage_members', 'edit_settings'],
    })
    .where(
      and(
        eq(organizationMembers.organizationId, body.organizationId),
        eq(organizationMembers.userDid, userDid)
      )
    );

  // Update new owner to owner
  await db
    .update(organizationMembers)
    .set({
      role: 'owner',
      permissions: ['bulk_import', 'manage_members', 'edit_settings', 'delete_org'],
    })
    .where(
      and(
        eq(organizationMembers.organizationId, body.organizationId),
        eq(organizationMembers.userDid, body.newOwnerDid)
      )
    );

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: body.organizationId,
    actorDid: userDid,
    action: 'ownership_transferred',
    targetType: 'member',
    targetId: body.newOwnerDid,
  });

  return c.json({ success: true });
});

// Delete organization
organizationRoutes.post('/io.exprsn.org.delete', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    confirmName: string;
    childAction?: 'orphan' | 'reparent' | 'cascade';
    newParentId?: string;
  }>();

  if (!body.organizationId || !body.confirmName) {
    throw new HTTPException(400, { message: 'Organization ID and confirmation required' });
  }

  // Get organization
  const orgResult = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, body.organizationId))
    .limit(1);

  const org = orgResult[0];
  if (!org) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  // Only owner can delete
  if (org.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Only the owner can delete the organization' });
  }

  // Confirm name matches
  if (body.confirmName !== org.name) {
    throw new HTTPException(400, { message: 'Organization name does not match' });
  }

  // Get child organizations
  const childOrgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.parentOrganizationId, body.organizationId));

  const childAction = body.childAction || 'orphan';
  let orphanedCount = 0;
  let reparentedCount = 0;
  let deletedCount = 0;

  if (childOrgs.length > 0) {
    switch (childAction) {
      case 'orphan':
        // Remove parent reference, making them root-level orgs
        await db
          .update(organizations)
          .set({
            parentOrganizationId: null,
            hierarchyPath: sql`'/' || id || '/'`,
            hierarchyLevel: 0,
          })
          .where(eq(organizations.parentOrganizationId, body.organizationId));
        orphanedCount = childOrgs.length;
        break;

      case 'reparent':
        if (!body.newParentId) {
          throw new HTTPException(400, { message: 'newParentId required for reparent action' });
        }
        // Verify new parent exists and user has permission
        const newParent = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, body.newParentId))
          .limit(1);
        if (!newParent[0]) {
          throw new HTTPException(404, { message: 'New parent organization not found' });
        }
        // Check user owns or can manage the new parent
        const newParentPermission = await checkOrgPermission(userDid, body.newParentId);
        if (!newParentPermission || newParentPermission.member.role !== 'owner') {
          throw new HTTPException(403, { message: 'You must be owner of the new parent organization' });
        }

        // Update children to point to new parent
        const newParentPath = newParent[0].hierarchyPath || `/${body.newParentId}/`;
        const newParentLevel = (newParent[0].hierarchyLevel || 0) + 1;

        for (const child of childOrgs) {
          const childPath = `${newParentPath}${child.id}/`;
          await db
            .update(organizations)
            .set({
              parentOrganizationId: body.newParentId,
              hierarchyPath: childPath,
              hierarchyLevel: newParentLevel,
            })
            .where(eq(organizations.id, child.id));

          // Update all descendants of this child
          await updateDescendantPaths(child.id, childPath, newParentLevel);
        }
        reparentedCount = childOrgs.length;
        break;

      case 'cascade':
        // Delete all descendants recursively
        deletedCount = await cascadeDeleteOrganization(body.organizationId);
        // Return early since the org itself is already deleted by cascade
        return c.json({ success: true, deletedCount: deletedCount + 1 });
    }
  }

  // Delete organization (cascade will handle related records)
  await db.delete(organizations).where(eq(organizations.id, body.organizationId));

  return c.json({
    success: true,
    orphanedCount,
    reparentedCount,
    deletedCount: deletedCount + 1,
  });
});

// Helper function to recursively update descendant paths
async function updateDescendantPaths(parentId: string, parentPath: string, parentLevel: number) {
  const children = await db
    .select()
    .from(organizations)
    .where(eq(organizations.parentOrganizationId, parentId));

  for (const child of children) {
    const childPath = `${parentPath}${child.id}/`;
    const childLevel = parentLevel + 1;
    await db
      .update(organizations)
      .set({
        hierarchyPath: childPath,
        hierarchyLevel: childLevel,
      })
      .where(eq(organizations.id, child.id));
    await updateDescendantPaths(child.id, childPath, childLevel);
  }
}

// Helper function to cascade delete organization and all descendants
async function cascadeDeleteOrganization(orgId: string): Promise<number> {
  let deletedCount = 0;

  // Get all children
  const children = await db
    .select()
    .from(organizations)
    .where(eq(organizations.parentOrganizationId, orgId));

  // Recursively delete children first
  for (const child of children) {
    deletedCount += await cascadeDeleteOrganization(child.id);
    await db.delete(organizations).where(eq(organizations.id, child.id));
    deletedCount++;
  }

  return deletedCount;
}

// ============================================
// Public Organization Profiles
// ============================================

// Get public profile by handle
organizationRoutes.get('/io.exprsn.org.getProfile', optionalAuthMiddleware, async (c) => {
  const userDid = c.get('did');
  const handle = c.req.query('handle');

  if (!handle) {
    throw new HTTPException(400, { message: 'Organization handle required' });
  }

  const result = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.handle, handle), eq(organizations.isPublic, true)))
    .limit(1);

  const org = result[0];
  if (!org) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  // Check if user is following or a member
  let isFollowing = false;
  let isMember = false;

  if (userDid) {
    const [followResult, memberResult] = await Promise.all([
      db
        .select()
        .from(organizationFollows)
        .where(
          and(
            eq(organizationFollows.organizationId, org.id),
            eq(organizationFollows.followerDid, userDid)
          )
        )
        .limit(1),
      db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, org.id),
            eq(organizationMembers.userDid, userDid)
          )
        )
        .limit(1),
    ]);
    isFollowing = followResult.length > 0;
    isMember = memberResult.length > 0;
  }

  return c.json({
    id: org.id,
    handle: org.handle,
    displayName: org.displayName || org.name,
    name: org.name,
    type: org.type,
    avatar: org.avatar,
    bannerImage: org.bannerImage,
    bio: org.bio,
    website: org.website,
    location: org.location,
    category: org.category,
    socialLinks: org.socialLinks,
    verified: org.verified,
    followerCount: org.followerCount,
    videoCount: org.videoCount,
    memberCount: org.memberCount,
    isFollowing,
    isMember,
    createdAt: org.createdAt.toISOString(),
  });
});

// Follow organization
organizationRoutes.post('/io.exprsn.org.follow', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ organizationId: string }>();

  if (!body.organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check org exists and is public
  const orgResult = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, body.organizationId), eq(organizations.isPublic, true)))
    .limit(1);

  if (!orgResult[0]) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  // Check if already following
  const existingFollow = await db
    .select()
    .from(organizationFollows)
    .where(
      and(
        eq(organizationFollows.organizationId, body.organizationId),
        eq(organizationFollows.followerDid, userDid)
      )
    )
    .limit(1);

  if (existingFollow[0]) {
    return c.json({ success: true, message: 'Already following' });
  }

  // Create follow
  await db.insert(organizationFollows).values({
    id: nanoid(),
    organizationId: body.organizationId,
    followerDid: userDid,
  });

  // Increment follower count
  await db
    .update(organizations)
    .set({ followerCount: sql`${organizations.followerCount} + 1` })
    .where(eq(organizations.id, body.organizationId));

  return c.json({ success: true });
});

// Unfollow organization
organizationRoutes.post('/io.exprsn.org.unfollow', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ organizationId: string }>();

  if (!body.organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Delete follow
  const result = await db
    .delete(organizationFollows)
    .where(
      and(
        eq(organizationFollows.organizationId, body.organizationId),
        eq(organizationFollows.followerDid, userDid)
      )
    );

  // Decrement follower count if unfollowed
  await db
    .update(organizations)
    .set({ followerCount: sql`GREATEST(${organizations.followerCount} - 1, 0)` })
    .where(eq(organizations.id, body.organizationId));

  return c.json({ success: true });
});

// Get organization's videos
organizationRoutes.get('/io.exprsn.org.getVideos', optionalAuthMiddleware, async (c) => {
  const orgId = c.req.query('organizationId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  const cursor = c.req.query('cursor');

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check org exists and is public
  const orgResult = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.isPublic, true)))
    .limit(1);

  if (!orgResult[0]) {
    throw new HTTPException(404, { message: 'Organization not found' });
  }

  let query = db
    .select({
      video: videos,
      author: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(videos)
    .innerJoin(users, eq(users.did, videos.authorDid))
    .where(eq(videos.publishedAsOrgId, orgId))
    .orderBy(desc(videos.createdAt))
    .limit(limit + 1);

  if (cursor) {
    // @ts-expect-error - Drizzle query chaining
    query = query.where(
      and(eq(videos.publishedAsOrgId, orgId), sql`${videos.createdAt} < ${new Date(cursor)}`)
    );
  }

  const results = await query;
  const hasMore = results.length > limit;
  const videoList = hasMore ? results.slice(0, -1) : results;

  return c.json({
    videos: videoList.map(({ video, author }) => ({
      uri: video.uri,
      thumbnailUrl: video.thumbnailUrl,
      caption: video.caption,
      duration: video.duration,
      viewCount: video.viewCount,
      likeCount: video.likeCount,
      commentCount: video.commentCount,
      author,
      createdAt: video.createdAt.toISOString(),
    })),
    cursor: hasMore ? videoList[videoList.length - 1]?.video.createdAt.toISOString() : undefined,
  });
});

// ============================================
// Role Management
// ============================================

// Initialize system roles for an organization
async function initializeSystemRoles(organizationId: string) {
  const systemRoleNames: SystemRoleName[] = ['owner', 'admin', 'editor', 'viewer', 'member'];
  const now = new Date();

  for (const roleName of systemRoleNames) {
    const roleConfig = SYSTEM_ROLES[roleName];
    const permissions = SYSTEM_ROLE_PERMISSIONS[roleName];

    await db
      .insert(organizationRoles)
      .values({
        id: nanoid(),
        organizationId,
        name: roleName,
        displayName: roleConfig.displayName,
        description: roleConfig.description,
        isSystem: true,
        permissions: permissions as string[],
        priority: roleConfig.priority,
        color: roleConfig.color,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
}

// List organization roles
organizationRoutes.get('/io.exprsn.org.roles.list', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const orgId = c.req.query('organizationId');

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check user is a member
  const access = await checkOrgPermission(userDid, orgId);
  if (!access) {
    throw new HTTPException(403, { message: 'Not a member of this organization' });
  }

  // Initialize system roles if needed
  await initializeSystemRoles(orgId);

  const roles = await db
    .select()
    .from(organizationRoles)
    .where(eq(organizationRoles.organizationId, orgId))
    .orderBy(desc(organizationRoles.priority), asc(organizationRoles.name));

  return c.json({
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions,
      priority: role.priority,
      color: role.color,
      createdAt: role.createdAt.toISOString(),
    })),
  });
});

// Create custom role
organizationRoutes.post('/io.exprsn.org.roles.create', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    name: string;
    displayName: string;
    description?: string;
    permissions: string[];
    color?: string;
  }>();

  if (!body.organizationId || !body.name || !body.displayName) {
    throw new HTTPException(400, { message: 'Organization ID, name, and display name required' });
  }

  // Check permission to manage roles
  const access = await checkOrgPermission(userDid, body.organizationId);
  if (!access || (access.member.role !== 'owner' && !access.member.permissions?.includes(ORG_PERMISSIONS.MANAGE_ROLES))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Validate name
  const nameRegex = /^[a-z0-9_-]+$/;
  if (!nameRegex.test(body.name) || body.name.length < 2 || body.name.length > 30) {
    throw new HTTPException(400, { message: 'Role name must be 2-30 lowercase alphanumeric characters, underscores, or hyphens' });
  }

  // Check name doesn't conflict with system roles
  const systemNames = ['owner', 'admin', 'editor', 'viewer', 'member'];
  if (systemNames.includes(body.name)) {
    throw new HTTPException(400, { message: 'Cannot use system role name' });
  }

  const roleId = nanoid();
  const now = new Date();

  await db.insert(organizationRoles).values({
    id: roleId,
    organizationId: body.organizationId,
    name: body.name,
    displayName: body.displayName,
    description: body.description,
    isSystem: false,
    permissions: body.permissions || [],
    priority: 50, // Custom roles have priority 50
    color: body.color,
    createdAt: now,
    updatedAt: now,
  });

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: body.organizationId,
    actorDid: userDid,
    action: 'role_created',
    targetType: 'role',
    targetId: roleId,
    details: { name: body.name, displayName: body.displayName },
  });

  return c.json({ id: roleId, success: true });
});

// Update role
organizationRoutes.post('/io.exprsn.org.roles.update', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    roleId: string;
    displayName?: string;
    description?: string;
    permissions?: string[];
    color?: string;
  }>();

  if (!body.roleId) {
    throw new HTTPException(400, { message: 'Role ID required' });
  }

  // Get role
  const roleResult = await db
    .select()
    .from(organizationRoles)
    .where(eq(organizationRoles.id, body.roleId))
    .limit(1);

  const role = roleResult[0];
  if (!role) {
    throw new HTTPException(404, { message: 'Role not found' });
  }

  // Cannot update system roles
  if (role.isSystem) {
    throw new HTTPException(400, { message: 'Cannot modify system roles' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, role.organizationId);
  if (!access || (access.member.role !== 'owner' && !access.member.permissions?.includes(ORG_PERMISSIONS.MANAGE_ROLES))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const updates: Partial<typeof organizationRoles.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.displayName !== undefined) updates.displayName = body.displayName;
  if (body.description !== undefined) updates.description = body.description;
  if (body.permissions !== undefined) updates.permissions = body.permissions;
  if (body.color !== undefined) updates.color = body.color;

  await db.update(organizationRoles).set(updates).where(eq(organizationRoles.id, body.roleId));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: role.organizationId,
    actorDid: userDid,
    action: 'role_updated',
    targetType: 'role',
    targetId: body.roleId,
  });

  return c.json({ success: true });
});

// Delete custom role
organizationRoutes.post('/io.exprsn.org.roles.delete', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    roleId: string;
    reassignToRoleId?: string;
  }>();

  if (!body.roleId) {
    throw new HTTPException(400, { message: 'Role ID required' });
  }

  // Get role
  const roleResult = await db
    .select()
    .from(organizationRoles)
    .where(eq(organizationRoles.id, body.roleId))
    .limit(1);

  const role = roleResult[0];
  if (!role) {
    throw new HTTPException(404, { message: 'Role not found' });
  }

  // Cannot delete system roles
  if (role.isSystem) {
    throw new HTTPException(400, { message: 'Cannot delete system roles' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, role.organizationId);
  if (!access || (access.member.role !== 'owner' && !access.member.permissions?.includes(ORG_PERMISSIONS.MANAGE_ROLES))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Reassign members to another role if specified
  if (body.reassignToRoleId) {
    await db
      .update(organizationMembers)
      .set({ roleId: body.reassignToRoleId })
      .where(eq(organizationMembers.roleId, body.roleId));
  }

  // Delete role
  await db.delete(organizationRoles).where(eq(organizationRoles.id, body.roleId));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: role.organizationId,
    actorDid: userDid,
    action: 'role_deleted',
    targetType: 'role',
    targetId: body.roleId,
    details: { name: role.name },
  });

  return c.json({ success: true });
});

// ============================================
// Invite Management
// ============================================

// Create invite
organizationRoutes.post('/io.exprsn.org.invites.create', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    email?: string;
    did?: string;
    roleId?: string;
    roleName?: string;
    message?: string;
  }>();

  if (!body.organizationId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  if (!body.email && !body.did) {
    throw new HTTPException(400, { message: 'Email or user DID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, body.organizationId);
  if (!access || (access.member.role !== 'owner' && access.member.role !== 'admin' && !access.member.permissions?.includes(ORG_PERMISSIONS.INVITE_MEMBERS))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // If inviting by DID, check user exists and not already a member
  if (body.did) {
    const existingMember = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, body.organizationId),
          eq(organizationMembers.userDid, body.did)
        )
      )
      .limit(1);

    if (existingMember[0]) {
      throw new HTTPException(400, { message: 'User is already a member' });
    }
  }

  const inviteId = nanoid();
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(organizationInvites).values({
    id: inviteId,
    organizationId: body.organizationId,
    email: body.email,
    invitedDid: body.did,
    roleId: body.roleId,
    roleName: body.roleName || 'member',
    invitedBy: userDid,
    token,
    message: body.message,
    status: 'pending',
    expiresAt,
  });

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: body.organizationId,
    actorDid: userDid,
    action: 'invite_sent',
    targetType: 'invite',
    targetId: inviteId,
    details: { email: body.email, did: body.did },
  });

  return c.json({ id: inviteId, token, expiresAt: expiresAt.toISOString() });
});

// List pending invites
organizationRoutes.get('/io.exprsn.org.invites.list', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const orgId = c.req.query('organizationId');

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, orgId);
  if (!access || (access.member.role !== 'owner' && access.member.role !== 'admin' && !access.member.permissions?.includes(ORG_PERMISSIONS.INVITE_MEMBERS))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const invites = await db
    .select({
      invite: organizationInvites,
      invitedUser: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
      invitedByUser: {
        did: sql<string>`inviter.did`,
        handle: sql<string>`inviter.handle`,
        displayName: sql<string>`inviter.display_name`,
      },
    })
    .from(organizationInvites)
    .leftJoin(users, eq(users.did, organizationInvites.invitedDid))
    .leftJoin(sql`users as inviter`, sql`inviter.did = ${organizationInvites.invitedBy}`)
    .where(and(eq(organizationInvites.organizationId, orgId), eq(organizationInvites.status, 'pending')))
    .orderBy(desc(organizationInvites.createdAt));

  return c.json({
    invites: invites.map(({ invite, invitedUser, invitedByUser }) => ({
      id: invite.id,
      email: invite.email,
      invitedUser: invite.invitedDid ? invitedUser : null,
      roleName: invite.roleName,
      invitedBy: invitedByUser,
      message: invite.message,
      status: invite.status,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    })),
  });
});

// Revoke invite
organizationRoutes.post('/io.exprsn.org.invites.revoke', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ inviteId: string }>();

  if (!body.inviteId) {
    throw new HTTPException(400, { message: 'Invite ID required' });
  }

  // Get invite
  const inviteResult = await db
    .select()
    .from(organizationInvites)
    .where(eq(organizationInvites.id, body.inviteId))
    .limit(1);

  const invite = inviteResult[0];
  if (!invite) {
    throw new HTTPException(404, { message: 'Invite not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, invite.organizationId);
  if (!access || (access.member.role !== 'owner' && access.member.role !== 'admin' && !access.member.permissions?.includes(ORG_PERMISSIONS.INVITE_MEMBERS))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Update status
  await db
    .update(organizationInvites)
    .set({ status: 'revoked' })
    .where(eq(organizationInvites.id, body.inviteId));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: invite.organizationId,
    actorDid: userDid,
    action: 'invite_revoked',
    targetType: 'invite',
    targetId: body.inviteId,
  });

  return c.json({ success: true });
});

// Accept invite
organizationRoutes.post('/io.exprsn.org.invites.accept', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ token: string }>();

  if (!body.token) {
    throw new HTTPException(400, { message: 'Invite token required' });
  }

  // Get invite
  const inviteResult = await db
    .select()
    .from(organizationInvites)
    .where(eq(organizationInvites.token, body.token))
    .limit(1);

  const invite = inviteResult[0];
  if (!invite) {
    throw new HTTPException(404, { message: 'Invite not found' });
  }

  if (invite.status !== 'pending') {
    throw new HTTPException(400, { message: 'Invite is no longer valid' });
  }

  if (invite.expiresAt < new Date()) {
    await db
      .update(organizationInvites)
      .set({ status: 'expired' })
      .where(eq(organizationInvites.id, invite.id));
    throw new HTTPException(400, { message: 'Invite has expired' });
  }

  // Check if already a member
  const existingMember = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, invite.organizationId),
        eq(organizationMembers.userDid, userDid)
      )
    )
    .limit(1);

  if (existingMember[0]) {
    throw new HTTPException(400, { message: 'Already a member of this organization' });
  }

  const now = new Date();

  // Add member
  await db.insert(organizationMembers).values({
    id: nanoid(),
    organizationId: invite.organizationId,
    userDid,
    role: invite.roleName || 'member',
    roleId: invite.roleId,
    invitedBy: invite.invitedBy,
    joinedAt: now,
  });

  // Update invite status
  await db
    .update(organizationInvites)
    .set({ status: 'accepted', acceptedAt: now })
    .where(eq(organizationInvites.id, invite.id));

  // Increment member count
  await db
    .update(organizations)
    .set({ memberCount: sql`${organizations.memberCount} + 1` })
    .where(eq(organizations.id, invite.organizationId));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: invite.organizationId,
    actorDid: userDid,
    action: 'invite_accepted',
    targetType: 'invite',
    targetId: invite.id,
  });

  return c.json({ success: true, organizationId: invite.organizationId });
});

// ============================================
// Content Moderation Queue
// ============================================

// Submit video for organization publishing
organizationRoutes.post('/io.exprsn.org.content.submit', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    organizationId: string;
    videoUri: string;
    caption?: string;
  }>();

  if (!body.organizationId || !body.videoUri) {
    throw new HTTPException(400, { message: 'Organization ID and video URI required' });
  }

  // Check user is a member with publish permission
  const access = await checkOrgPermission(userDid, body.organizationId);
  if (!access || (access.member.role !== 'owner' && access.member.role !== 'admin' && !access.member.permissions?.includes(ORG_PERMISSIONS.PUBLISH_CONTENT) && !access.member.canPublishOnBehalf)) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Check video exists and belongs to user
  const videoResult = await db
    .select()
    .from(videos)
    .where(and(eq(videos.uri, body.videoUri), eq(videos.authorDid, userDid)))
    .limit(1);

  if (!videoResult[0]) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  // If org requires content approval, add to queue
  if (access.org.requireContentApproval && access.member.role !== 'owner' && access.member.role !== 'admin') {
    const queueId = nanoid();
    await db.insert(organizationContentQueue).values({
      id: queueId,
      organizationId: body.organizationId,
      videoUri: body.videoUri,
      submittedBy: userDid,
      submittedCaption: body.caption,
      status: 'pending',
    });

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId: body.organizationId,
      actorDid: userDid,
      action: 'content_submitted',
      targetType: 'video',
      targetId: body.videoUri,
    });

    return c.json({ queued: true, queueId });
  }

  // Otherwise, publish directly
  await db
    .update(videos)
    .set({ publishedAsOrgId: body.organizationId })
    .where(eq(videos.uri, body.videoUri));

  // Increment org video count
  await db
    .update(organizations)
    .set({ videoCount: sql`${organizations.videoCount} + 1` })
    .where(eq(organizations.id, body.organizationId));

  return c.json({ published: true });
});

// Get content queue
organizationRoutes.get('/io.exprsn.org.content.queue', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const orgId = c.req.query('organizationId');
  const status = c.req.query('status') || 'pending';
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check permission to review content
  const access = await checkOrgPermission(userDid, orgId);
  if (!access || (access.member.role !== 'owner' && access.member.role !== 'admin' && !access.member.permissions?.includes(ORG_PERMISSIONS.REVIEW_CONTENT))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const queueItems = await db
    .select({
      queue: organizationContentQueue,
      video: {
        uri: videos.uri,
        thumbnailUrl: videos.thumbnailUrl,
        caption: videos.caption,
        duration: videos.duration,
      },
      submitter: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(organizationContentQueue)
    .innerJoin(videos, eq(videos.uri, organizationContentQueue.videoUri))
    .innerJoin(users, eq(users.did, organizationContentQueue.submittedBy))
    .where(
      and(
        eq(organizationContentQueue.organizationId, orgId),
        eq(organizationContentQueue.status, status)
      )
    )
    .orderBy(desc(organizationContentQueue.priority), asc(organizationContentQueue.createdAt))
    .limit(limit);

  return c.json({
    items: queueItems.map(({ queue, video, submitter }) => ({
      id: queue.id,
      video,
      submittedBy: submitter,
      submittedCaption: queue.submittedCaption,
      status: queue.status,
      priority: queue.priority,
      createdAt: queue.createdAt.toISOString(),
    })),
  });
});

// Review content item
organizationRoutes.post('/io.exprsn.org.content.review', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    queueId: string;
    action: 'approve' | 'reject' | 'request_revision';
    notes?: string;
  }>();

  if (!body.queueId || !body.action) {
    throw new HTTPException(400, { message: 'Queue ID and action required' });
  }

  // Get queue item
  const queueResult = await db
    .select()
    .from(organizationContentQueue)
    .where(eq(organizationContentQueue.id, body.queueId))
    .limit(1);

  const queueItem = queueResult[0];
  if (!queueItem) {
    throw new HTTPException(404, { message: 'Queue item not found' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, queueItem.organizationId);
  if (!access || (access.member.role !== 'owner' && access.member.role !== 'admin' && !access.member.permissions?.includes(ORG_PERMISSIONS.REVIEW_CONTENT))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const now = new Date();
  let newStatus: 'approved' | 'rejected' | 'revision_requested';
  let activityAction: 'content_approved' | 'content_rejected';

  switch (body.action) {
    case 'approve':
      newStatus = 'approved';
      activityAction = 'content_approved';

      // Publish the video
      await db
        .update(videos)
        .set({ publishedAsOrgId: queueItem.organizationId })
        .where(eq(videos.uri, queueItem.videoUri));

      // Increment video count
      await db
        .update(organizations)
        .set({ videoCount: sql`${organizations.videoCount} + 1` })
        .where(eq(organizations.id, queueItem.organizationId));
      break;

    case 'reject':
      newStatus = 'rejected';
      activityAction = 'content_rejected';
      break;

    case 'request_revision':
      newStatus = 'revision_requested';
      activityAction = 'content_rejected'; // Use rejected for activity log
      break;

    default:
      throw new HTTPException(400, { message: 'Invalid action' });
  }

  // Update queue item
  await db
    .update(organizationContentQueue)
    .set({
      status: newStatus,
      reviewedBy: userDid,
      reviewedAt: now,
      reviewNotes: body.notes,
      revisionNotes: body.action === 'request_revision' ? body.notes : undefined,
      updatedAt: now,
    })
    .where(eq(organizationContentQueue.id, body.queueId));

  // Log activity
  await db.insert(organizationActivity).values({
    id: nanoid(),
    organizationId: queueItem.organizationId,
    actorDid: userDid,
    action: activityAction,
    targetType: 'video',
    targetId: queueItem.videoUri,
    details: { action: body.action, notes: body.notes },
  });

  return c.json({ success: true, status: newStatus });
});

// ============================================
// Analytics
// ============================================

// Get analytics overview
organizationRoutes.get('/io.exprsn.org.analytics.overview', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const orgId = c.req.query('organizationId');
  const period = c.req.query('period') || '7d';

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  // Check permission
  const access = await checkOrgPermission(userDid, orgId);
  if (!access || (access.member.role !== 'owner' && access.member.role !== 'admin' && !access.member.permissions?.includes(ORG_PERMISSIONS.VIEW_ANALYTICS))) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Calculate date range
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get video stats
  const videoStats = await db
    .select({
      totalViews: sql<number>`COALESCE(SUM(${videos.viewCount}), 0)`,
      totalLikes: sql<number>`COALESCE(SUM(${videos.likeCount}), 0)`,
      totalComments: sql<number>`COALESCE(SUM(${videos.commentCount}), 0)`,
      totalShares: sql<number>`COALESCE(SUM(${videos.shareCount}), 0)`,
      videoCount: count(),
    })
    .from(videos)
    .where(eq(videos.publishedAsOrgId, orgId));

  // Get top videos
  const topVideos = await db
    .select({
      uri: videos.uri,
      thumbnailUrl: videos.thumbnailUrl,
      caption: videos.caption,
      views: videos.viewCount,
      likes: videos.likeCount,
    })
    .from(videos)
    .where(eq(videos.publishedAsOrgId, orgId))
    .orderBy(desc(videos.viewCount))
    .limit(5);

  // Get org data
  const orgResult = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const org = orgResult[0];

  return c.json({
    period,
    totalViews: videoStats[0]?.totalViews || 0,
    totalLikes: videoStats[0]?.totalLikes || 0,
    totalComments: videoStats[0]?.totalComments || 0,
    totalShares: videoStats[0]?.totalShares || 0,
    followerCount: org?.followerCount || 0,
    videoCount: videoStats[0]?.videoCount || 0,
    topVideos,
    viewsByDay: [], // Would need time-series data collection
  });
});

// Get user's organizations with membership info
organizationRoutes.get('/io.exprsn.org.getUserOrganizations', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  try {
    // Try query with role join first
    const results = await db
      .select({
        org: organizations,
        member: organizationMembers,
        role: organizationRoles,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .leftJoin(organizationRoles, eq(organizationRoles.id, organizationMembers.roleId))
      .where(eq(organizationMembers.userDid, userDid))
      .orderBy(desc(organizationMembers.joinedAt));

    return c.json({
      organizations: results.map(({ org, member, role }) => ({
        id: org.id,
        name: org.name,
        handle: org.handle,
        displayName: org.displayName,
        type: org.type,
        avatar: org.avatar,
        verified: org.verified,
        membership: {
          id: member.id,
          role: role
            ? {
                id: role.id,
                name: role.name,
                displayName: role.displayName,
                permissions: role.permissions,
                color: role.color,
              }
            : {
                name: member.role,
                displayName: member.role.charAt(0).toUpperCase() + member.role.slice(1),
                permissions: member.permissions,
              },
          title: member.title,
          canPublishOnBehalf: member.canPublishOnBehalf,
          joinedAt: member.joinedAt.toISOString(),
        },
      })),
    });
  } catch (error) {
    // If the query fails (e.g., organization_roles table doesn't exist),
    // fall back to a simpler query without the role join
    console.error('[getUserOrganizations] Error with role join, trying without:', error);

    const results = await db
      .select({
        org: organizations,
        member: organizationMembers,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userDid, userDid))
      .orderBy(desc(organizationMembers.joinedAt));

    return c.json({
      organizations: results.map(({ org, member }) => ({
        id: org.id,
        name: org.name,
        handle: org.handle,
        displayName: org.displayName,
        type: org.type,
        avatar: org.avatar,
        verified: org.verified,
        membership: {
          id: member.id,
          role: {
            name: member.role,
            displayName: member.role.charAt(0).toUpperCase() + member.role.slice(1),
            permissions: member.permissions,
          },
          title: member.title,
          canPublishOnBehalf: member.canPublishOnBehalf,
          joinedAt: member.joinedAt.toISOString(),
        },
      })),
    });
  }
});

// ============================================
// Organization Hierarchy Endpoints
// ============================================

/**
 * Get child organizations
 * GET /xrpc/io.exprsn.org.getChildren
 */
organizationRoutes.get('/io.exprsn.org.getChildren', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const orgId = c.req.query('id');

  if (!orgId) {
    return c.json({ error: 'Organization ID is required' }, 400);
  }

  // Check if user has access to the parent organization
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.userDid, userDid)
    ),
  });

  if (!member) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Get child organizations
  const children = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      displayName: organizations.displayName,
      handle: organizations.handle,
      type: organizations.type,
      avatar: organizations.avatar,
      verified: organizations.verified,
      memberCount: organizations.memberCount,
      hierarchyLevel: organizations.hierarchyLevel,
    })
    .from(organizations)
    .where(eq(organizations.parentOrganizationId, orgId))
    .orderBy(organizations.name);

  return c.json({ children });
});

/**
 * Get organization ancestors (parent chain)
 * GET /xrpc/io.exprsn.org.getAncestors
 */
organizationRoutes.get('/io.exprsn.org.getAncestors', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const orgId = c.req.query('id');

  if (!orgId) {
    return c.json({ error: 'Organization ID is required' }, 400);
  }

  // Check access
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, orgId),
      eq(organizationMembers.userDid, userDid)
    ),
  });

  if (!member) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Get the organization to find its hierarchy path
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  // Parse hierarchy path and get ancestors
  const ancestors: Array<{
    id: string;
    name: string;
    displayName: string | null;
    handle: string | null;
    type: string;
    level: number;
  }> = [];

  if (org.hierarchyPath) {
    const pathIds = org.hierarchyPath.split('/').filter(Boolean);
    // Exclude the current org from ancestors
    const ancestorIds = pathIds.slice(0, -1);

    if (ancestorIds.length > 0) {
      const ancestorOrgs = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          displayName: organizations.displayName,
          handle: organizations.handle,
          type: organizations.type,
          hierarchyLevel: organizations.hierarchyLevel,
        })
        .from(organizations)
        .where(sql`${organizations.id} = ANY(${ancestorIds})`);

      // Sort by hierarchy level
      ancestorOrgs.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel);

      for (const ancestor of ancestorOrgs) {
        ancestors.push({
          id: ancestor.id,
          name: ancestor.name,
          displayName: ancestor.displayName,
          handle: ancestor.handle,
          type: ancestor.type,
          level: ancestor.hierarchyLevel,
        });
      }
    }
  }

  return c.json({ ancestors });
});

/**
 * Set parent organization
 * POST /xrpc/io.exprsn.org.setParent
 */
organizationRoutes.post('/io.exprsn.org.setParent', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    organizationId: string;
    parentOrganizationId: string | null;
  }>();

  const { organizationId, parentOrganizationId } = body;

  if (!organizationId) {
    return c.json({ error: 'Organization ID is required' }, 400);
  }

  // Check if user is owner of the organization
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userDid, userDid)
    ),
  });

  if (!member || member.role !== 'owner') {
    return c.json({ error: 'Only organization owners can change hierarchy' }, 403);
  }

  // If setting a parent, verify access to parent org
  let newHierarchyPath = `/${organizationId}/`;
  let newHierarchyLevel = 0;

  if (parentOrganizationId) {
    // Check user has permission on parent org
    const parentMember = await db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, parentOrganizationId),
        eq(organizationMembers.userDid, userDid)
      ),
    });

    if (!parentMember || !['owner', 'admin'].includes(parentMember.role)) {
      return c.json({ error: 'Access denied to parent organization' }, 403);
    }

    // Get parent org details
    const parentOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, parentOrganizationId),
    });

    if (!parentOrg) {
      return c.json({ error: 'Parent organization not found' }, 404);
    }

    // Prevent circular reference
    if (parentOrg.hierarchyPath?.includes(`/${organizationId}/`)) {
      return c.json({ error: 'Cannot create circular hierarchy' }, 400);
    }

    // Calculate new hierarchy path and level
    newHierarchyPath = `${parentOrg.hierarchyPath || `/${parentOrganizationId}/`}${organizationId}/`;
    newHierarchyLevel = parentOrg.hierarchyLevel + 1;
  }

  // Update the organization
  await db
    .update(organizations)
    .set({
      parentOrganizationId,
      hierarchyPath: newHierarchyPath,
      hierarchyLevel: newHierarchyLevel,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  // Update all descendant organizations' hierarchy paths
  const descendants = await db
    .select()
    .from(organizations)
    .where(sql`${organizations.hierarchyPath} LIKE ${`%/${organizationId}/%`}`);

  for (const desc of descendants) {
    if (desc.id !== organizationId && desc.hierarchyPath) {
      // Find where the old path to this org ends and append the rest
      const pathParts = desc.hierarchyPath.split(`/${organizationId}/`);
      if (pathParts.length > 1) {
        const newDescPath = `${newHierarchyPath}${pathParts[1]}`;
        const newDescLevel = newDescPath.split('/').filter(Boolean).length - 1;

        await db
          .update(organizations)
          .set({
            hierarchyPath: newDescPath,
            hierarchyLevel: newDescLevel,
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, desc.id));
      }
    }
  }

  return c.json({ success: true });
});

/**
 * Set organization domain
 * POST /xrpc/io.exprsn.org.setDomain
 */
organizationRoutes.post('/io.exprsn.org.setDomain', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    organizationId: string;
    domainId: string | null;
  }>();

  const { organizationId, domainId } = body;

  if (!organizationId) {
    return c.json({ error: 'Organization ID is required' }, 400);
  }

  // Check if user is owner of the organization
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userDid, userDid)
    ),
  });

  if (!member || member.role !== 'owner') {
    return c.json({ error: 'Only organization owners can change domain association' }, 403);
  }

  // Update the organization's domain
  await db
    .update(organizations)
    .set({
      domainId,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  return c.json({ success: true });
});

// ============================================
// Domain Invites - Join domains via invite code
// ============================================

// Create domain invite
organizationRoutes.post('/io.exprsn.domain.invites.create', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    domainId: string;
    email?: string;
    invitedDid?: string;
    role?: string;
    message?: string;
    expiresInDays?: number;
  }>();

  if (!body.domainId) {
    throw new HTTPException(400, { message: 'Domain ID required' });
  }

  if (!body.email && !body.invitedDid) {
    throw new HTTPException(400, { message: 'Either email or DID required' });
  }

  // Check if user is admin of the domain
  const domainUser = await db
    .select()
    .from(domainUsers)
    .where(
      and(
        eq(domainUsers.domainId, body.domainId),
        eq(domainUsers.userDid, userDid)
      )
    )
    .limit(1);

  if (!domainUser[0] || !['admin', 'owner'].includes(domainUser[0].role)) {
    throw new HTTPException(403, { message: 'Only domain admins can create invites' });
  }

  const inviteId = nanoid();
  const token = nanoid(16); // Shorter, user-friendly code
  const expiresAt = new Date(Date.now() + (body.expiresInDays || 7) * 24 * 60 * 60 * 1000);

  await db.insert(domainInvites).values({
    id: inviteId,
    domainId: body.domainId,
    email: body.email?.toLowerCase(),
    invitedDid: body.invitedDid,
    role: body.role || 'member',
    invitedBy: userDid,
    token,
    message: body.message,
    status: 'pending',
    expiresAt,
  });

  return c.json({
    success: true,
    invite: {
      id: inviteId,
      token,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

// Accept domain invite
organizationRoutes.post('/io.exprsn.domain.invites.accept', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ token: string }>();

  if (!body.token) {
    throw new HTTPException(400, { message: 'Invite token required' });
  }

  // Get invite
  const inviteResult = await db
    .select()
    .from(domainInvites)
    .where(eq(domainInvites.token, body.token))
    .limit(1);

  const invite = inviteResult[0];
  if (!invite) {
    throw new HTTPException(404, { message: 'Invite not found' });
  }

  if (invite.status !== 'pending') {
    throw new HTTPException(400, { message: 'Invite is no longer valid' });
  }

  if (invite.expiresAt < new Date()) {
    await db
      .update(domainInvites)
      .set({ status: 'expired' })
      .where(eq(domainInvites.id, invite.id));
    throw new HTTPException(400, { message: 'Invite has expired' });
  }

  // Check if already a domain member
  const existingMember = await db
    .select()
    .from(domainUsers)
    .where(
      and(
        eq(domainUsers.domainId, invite.domainId),
        eq(domainUsers.userDid, userDid)
      )
    )
    .limit(1);

  if (existingMember[0]) {
    throw new HTTPException(400, { message: 'Already a member of this domain' });
  }

  const now = new Date();

  // Add user to domain
  await db.insert(domainUsers).values({
    id: nanoid(),
    domainId: invite.domainId,
    userDid,
    role: invite.role,
    permissions: invite.permissions || [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  // Update invite status
  await db
    .update(domainInvites)
    .set({ status: 'accepted', acceptedAt: now })
    .where(eq(domainInvites.id, invite.id));

  // Get domain info for response
  const domain = await db
    .select({ id: domains.id, name: domains.name, domain: domains.domain })
    .from(domains)
    .where(eq(domains.id, invite.domainId))
    .limit(1);

  return c.json({
    success: true,
    domain: domain[0] || { id: invite.domainId },
  });
});

// Get invite details by token (for preview before accepting)
organizationRoutes.get('/io.exprsn.domain.invites.info', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    throw new HTTPException(400, { message: 'Token required' });
  }

  const invite = await db
    .select({
      id: domainInvites.id,
      domainId: domainInvites.domainId,
      role: domainInvites.role,
      message: domainInvites.message,
      status: domainInvites.status,
      expiresAt: domainInvites.expiresAt,
      domainName: domains.name,
      domainDomain: domains.domain,
    })
    .from(domainInvites)
    .leftJoin(domains, eq(domainInvites.domainId, domains.id))
    .where(eq(domainInvites.token, token))
    .limit(1);

  if (!invite[0]) {
    throw new HTTPException(404, { message: 'Invite not found' });
  }

  const inv = invite[0];

  if (inv.status !== 'pending') {
    throw new HTTPException(400, { message: 'Invite is no longer valid' });
  }

  if (inv.expiresAt && inv.expiresAt < new Date()) {
    throw new HTTPException(400, { message: 'Invite has expired' });
  }

  return c.json({
    invite: {
      id: inv.id,
      role: inv.role,
      message: inv.message,
      expiresAt: inv.expiresAt?.toISOString(),
      domain: {
        id: inv.domainId,
        name: inv.domainName,
        domain: inv.domainDomain,
      },
    },
  });
});

export default organizationRoutes;
