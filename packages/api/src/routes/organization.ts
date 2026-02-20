import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  organizations,
  organizationMembers,
  bulkImportJobs,
  users,
} from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  createImportJob,
  generateCSVTemplate,
  generateXLSXTemplate,
} from '../services/bulk-import.js';

// Middleware type for authenticated requests
type AuthContext = {
  Variables: {
    userDid: string;
  };
};

export const organizationRoutes = new Hono<AuthContext>();

// Helper to check if user has permission in organization
async function checkOrgPermission(
  userDid: string,
  organizationId: string,
  requiredPermission?: string
): Promise<{ member: typeof organizationMembers.$inferSelect; org: typeof organizations.$inferSelect } | null> {
  const result = await db
    .select({
      member: organizationMembers,
      org: organizations,
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
organizationRoutes.post('/xrpc/io.exprsn.org.create', async (c) => {
  const userDid = c.get('userDid');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    name: string;
    type: 'team' | 'enterprise' | 'nonprofit' | 'business';
    description?: string;
    website?: string;
  }>();

  if (!body.name || body.name.length < 2 || body.name.length > 100) {
    throw new HTTPException(400, { message: 'Organization name must be 2-100 characters' });
  }

  if (!['team', 'enterprise', 'nonprofit', 'business'].includes(body.type)) {
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

  // Add owner as member
  await db.insert(organizationMembers).values({
    id: nanoid(),
    organizationId: orgId,
    userDid,
    role: 'owner',
    permissions: ['bulk_import', 'manage_members', 'edit_settings', 'delete_org'],
    joinedAt: now,
  });

  return c.json({
    id: orgId,
    name: body.name,
    type: body.type,
  });
});

// Get organization
organizationRoutes.get('/xrpc/io.exprsn.org.get', async (c) => {
  const userDid = c.get('userDid');
  const orgId = c.req.query('id');

  if (!orgId) {
    throw new HTTPException(400, { message: 'Organization ID required' });
  }

  const result = await db
    .select()
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
organizationRoutes.post('/xrpc/io.exprsn.org.update', async (c) => {
  const userDid = c.get('userDid');
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

// List user's organizations
organizationRoutes.get('/xrpc/io.exprsn.org.list', async (c) => {
  const userDid = c.get('userDid');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const result = await db
    .select({
      org: organizations,
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
      avatar: org.avatar,
      memberCount: org.memberCount,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
    })),
  });
});

// ============================================
// Member Management
// ============================================

// List organization members
organizationRoutes.get('/xrpc/io.exprsn.org.members.list', async (c) => {
  const userDid = c.get('userDid');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const orgId = c.req.query('organizationId');
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
organizationRoutes.post('/xrpc/io.exprsn.org.members.invite', async (c) => {
  const userDid = c.get('userDid');
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
organizationRoutes.post('/xrpc/io.exprsn.org.members.updateRole', async (c) => {
  const userDid = c.get('userDid');
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
organizationRoutes.post('/xrpc/io.exprsn.org.members.remove', async (c) => {
  const userDid = c.get('userDid');
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
organizationRoutes.post('/xrpc/io.exprsn.org.import.upload', async (c) => {
  const userDid = c.get('userDid');
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
organizationRoutes.get('/xrpc/io.exprsn.org.import.status', async (c) => {
  const userDid = c.get('userDid');
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
organizationRoutes.get('/xrpc/io.exprsn.org.import.list', async (c) => {
  const userDid = c.get('userDid');
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
organizationRoutes.get('/xrpc/io.exprsn.org.import.template', async (c) => {
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
organizationRoutes.post('/xrpc/io.exprsn.org.import.cancel', async (c) => {
  const userDid = c.get('userDid');
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

export default organizationRoutes;
