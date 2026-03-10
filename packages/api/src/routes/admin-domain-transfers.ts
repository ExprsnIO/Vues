import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq, and, or, desc, isNull, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  domains,
  domainTransfers,
  organizations,
  users,
  domainActivityLog,
  organizationMembers,
  notifications,
  type DomainTransfer,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { notifyAdmins, broadcastAdminActivity } from '../websocket/admin.js';

export const adminDomainTransfersRouter = new Hono();

/**
 * Notify organization admins about domain transfer events
 */
async function notifyOrgAdmins(
  organizationId: string,
  actorDid: string,
  reason: string,
  reasonSubject: string,
  targetUri: string
): Promise<void> {
  // Get organization admins (owners and admins)
  const orgAdmins = await db
    .select({ userDid: organizationMembers.userDid })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.status, 'active'),
        or(
          eq(organizationMembers.role, 'owner'),
          eq(organizationMembers.role, 'admin')
        )
      )
    );

  if (orgAdmins.length === 0) {
    console.warn(`[DomainTransfer] No admins found for organization ${organizationId}`);
    return;
  }

  // Create in-app notifications for each admin
  const notificationValues = orgAdmins.map((admin) => ({
    id: nanoid(),
    userDid: admin.userDid,
    actorDid,
    reason,
    reasonSubject,
    targetUri,
    isRead: false,
    createdAt: new Date(),
    indexedAt: new Date(),
  }));

  await db.insert(notifications).values(notificationValues);
}

// Apply admin auth middleware
adminDomainTransfersRouter.use('*', adminAuthMiddleware);

/**
 * Initiate domain transfer
 * POST /xrpc/io.exprsn.admin.domains.transfer.initiate
 */
adminDomainTransfersRouter.post(
  '/io.exprsn.admin.domains.transfer.initiate',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DOMAINS),
  async (c) => {
    const body = await c.req.json<{
      domainId: string;
      targetOrganizationId?: string | null; // null = make independent
      targetUserDid?: string | null;
      reason?: string;
      notes?: string;
      requiresApproval?: boolean;
      autoApproveAfterDays?: number;
    }>();

    const adminUser = c.get('adminUser');
    const actorDid = c.get('did');

    if (!body.domainId) {
      throw new HTTPException(400, { message: 'Domain ID is required' });
    }

    // If no target specified, this is independence transfer
    const makeIndependent = !body.targetOrganizationId && !body.targetUserDid;

    // Fetch domain
    const [domain] = await db.select().from(domains).where(eq(domains.id, body.domainId)).limit(1);

    if (!domain) {
      throw new HTTPException(404, { message: 'Domain not found' });
    }

    // Check if there's already a pending transfer for this domain
    const [existingTransfer] = await db
      .select()
      .from(domainTransfers)
      .where(
        and(
          eq(domainTransfers.domainId, body.domainId),
          eq(domainTransfers.status, 'pending')
        )
      )
      .limit(1);

    if (existingTransfer) {
      throw new HTTPException(400, {
        message: 'There is already a pending transfer for this domain',
      });
    }

    // Validate target organization if specified
    if (body.targetOrganizationId) {
      const [targetOrg] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, body.targetOrganizationId))
        .limit(1);

      if (!targetOrg) {
        throw new HTTPException(404, { message: 'Target organization not found' });
      }

      if (targetOrg.status !== 'active') {
        throw new HTTPException(400, { message: 'Target organization is not active' });
      }
    }

    // Validate target user if specified
    if (body.targetUserDid) {
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.did, body.targetUserDid))
        .limit(1);

      if (!targetUser) {
        throw new HTTPException(404, { message: 'Target user not found' });
      }
    }

    // Calculate expiration (default 7 days for manual approval, or custom)
    const requiresApproval = body.requiresApproval ?? true;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 day expiration

    let autoApproveAfter: Date | null = null;
    if (body.autoApproveAfterDays && body.autoApproveAfterDays > 0) {
      autoApproveAfter = new Date();
      autoApproveAfter.setDate(autoApproveAfter.getDate() + body.autoApproveAfterDays);
    }

    // Create transfer record
    const transferId = nanoid();
    await db.insert(domainTransfers).values({
      id: transferId,
      domainId: body.domainId,
      sourceOrganizationId: domain.ownerOrgId,
      sourceUserDid: domain.ownerUserDid,
      targetOrganizationId: body.targetOrganizationId || null,
      targetUserDid: body.targetUserDid || null,
      status: 'pending',
      initiatedBy: actorDid,
      reason: body.reason || (makeIndependent ? 'Making domain independent' : 'Transfer to new owner'),
      notes: body.notes,
      requiresApproval,
      autoApproveAfter,
      expiresAt,
      notificationsSent: false,
      remindersSent: 0,
    });

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: body.domainId,
      actorDid,
      action: 'transfer_initiated',
      targetType: 'transfer',
      targetId: transferId,
      metadata: {
        sourceOrg: domain.ownerOrgId,
        sourceUser: domain.ownerUserDid,
        targetOrg: body.targetOrganizationId,
        targetUser: body.targetUserDid,
        makeIndependent,
        reason: body.reason,
      },
    });

    // Send notifications to target org/user admins
    if (body.targetOrganizationId) {
      // Notify organization admins about incoming transfer request
      await notifyOrgAdmins(
        body.targetOrganizationId,
        actorDid,
        'domain_transfer_incoming',
        `domain:${body.domainId}`,
        `at://transfer/${transferId}`
      );

      // Also broadcast to system admins
      await notifyAdmins({
        type: 'domain_transfer_incoming',
        title: 'Incoming Domain Transfer',
        message: `Domain "${domain.name}" transfer request received`,
        data: {
          transferId,
          domainId: body.domainId,
          domainName: domain.name,
        },
      });
    }

    // Broadcast admin activity
    await broadcastAdminActivity({
      type: 'domain_transfer_initiated',
      actorDid,
      actorHandle: actorDid,
      message: `Initiated transfer for domain "${domain.name}"`,
      metadata: { transferId, domainId: body.domainId },
    });

    // Fetch and return the created transfer
    const [transfer] = await db
      .select()
      .from(domainTransfers)
      .where(eq(domainTransfers.id, transferId))
      .limit(1);

    return c.json({
      success: true,
      transfer,
    });
  }
);

/**
 * Approve domain transfer
 * POST /xrpc/io.exprsn.admin.domains.transfer.approve
 */
adminDomainTransfersRouter.post(
  '/io.exprsn.admin.domains.transfer.approve',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DOMAINS),
  async (c) => {
    const body = await c.req.json<{
      transferId: string;
      notes?: string;
    }>();

    const actorDid = c.get('did');

    if (!body.transferId) {
      throw new HTTPException(400, { message: 'Transfer ID is required' });
    }

    // Fetch transfer
    const [transfer] = await db
      .select()
      .from(domainTransfers)
      .where(eq(domainTransfers.id, body.transferId))
      .limit(1);

    if (!transfer) {
      throw new HTTPException(404, { message: 'Transfer not found' });
    }

    if (transfer.status !== 'pending') {
      throw new HTTPException(400, {
        message: `Transfer cannot be approved. Current status: ${transfer.status}`,
      });
    }

    // Fetch domain
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, transfer.domainId))
      .limit(1);

    if (!domain) {
      throw new HTTPException(404, { message: 'Domain not found' });
    }

    // Update transfer status
    await db
      .update(domainTransfers)
      .set({
        status: 'approved',
        approvedBy: actorDid,
        approvedAt: new Date(),
        adminNotes: body.notes,
        updatedAt: new Date(),
      })
      .where(eq(domainTransfers.id, body.transferId));

    // Execute the transfer - update domain ownership
    await db
      .update(domains)
      .set({
        ownerOrgId: transfer.targetOrganizationId,
        ownerUserDid: transfer.targetUserDid,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, transfer.domainId));

    // Complete the transfer
    await db
      .update(domainTransfers)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domainTransfers.id, body.transferId));

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: transfer.domainId,
      actorDid,
      action: 'transfer_completed',
      targetType: 'transfer',
      targetId: body.transferId,
      metadata: {
        previousOwnerOrg: transfer.sourceOrganizationId,
        previousOwnerUser: transfer.sourceUserDid,
        newOwnerOrg: transfer.targetOrganizationId,
        newOwnerUser: transfer.targetUserDid,
        approvedBy: actorDid,
      },
    });

    // Notify relevant parties
    await notifyAdmins({
      type: 'domain_transfer_completed',
      title: 'Domain Transfer Completed',
      message: `Domain "${domain.name}" has been transferred`,
      data: {
        transferId: body.transferId,
        domainId: transfer.domainId,
        domainName: domain.name,
      },
    });

    // Broadcast admin activity
    await broadcastAdminActivity({
      type: 'domain_transfer_approved',
      actorDid,
      actorHandle: actorDid,
      message: `Approved transfer for domain "${domain.name}"`,
      metadata: { transferId: body.transferId, domainId: transfer.domainId },
    });

    return c.json({
      success: true,
      message: 'Domain transfer approved and completed',
    });
  }
);

/**
 * Reject domain transfer
 * POST /xrpc/io.exprsn.admin.domains.transfer.reject
 */
adminDomainTransfersRouter.post(
  '/io.exprsn.admin.domains.transfer.reject',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DOMAINS),
  async (c) => {
    const body = await c.req.json<{
      transferId: string;
      reason?: string;
    }>();

    const actorDid = c.get('did');

    if (!body.transferId) {
      throw new HTTPException(400, { message: 'Transfer ID is required' });
    }

    // Fetch transfer
    const [transfer] = await db
      .select()
      .from(domainTransfers)
      .where(eq(domainTransfers.id, body.transferId))
      .limit(1);

    if (!transfer) {
      throw new HTTPException(404, { message: 'Transfer not found' });
    }

    if (transfer.status !== 'pending') {
      throw new HTTPException(400, {
        message: `Transfer cannot be rejected. Current status: ${transfer.status}`,
      });
    }

    // Fetch domain
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, transfer.domainId))
      .limit(1);

    if (!domain) {
      throw new HTTPException(404, { message: 'Domain not found' });
    }

    // Update transfer status
    await db
      .update(domainTransfers)
      .set({
        status: 'rejected',
        rejectedBy: actorDid,
        rejectedAt: new Date(),
        adminNotes: body.reason,
        updatedAt: new Date(),
      })
      .where(eq(domainTransfers.id, body.transferId));

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: transfer.domainId,
      actorDid,
      action: 'transfer_rejected',
      targetType: 'transfer',
      targetId: body.transferId,
      metadata: {
        reason: body.reason,
        rejectedBy: actorDid,
      },
    });

    // Notify initiator
    await notifyAdmins({
      type: 'domain_transfer_rejected',
      title: 'Domain Transfer Rejected',
      message: `Domain "${domain.name}" transfer was rejected`,
      data: {
        transferId: body.transferId,
        domainId: transfer.domainId,
        domainName: domain.name,
        reason: body.reason,
      },
    });

    // Broadcast admin activity
    await broadcastAdminActivity({
      type: 'domain_transfer_rejected',
      actorDid,
      actorHandle: actorDid,
      message: `Rejected transfer for domain "${domain.name}"`,
      metadata: { transferId: body.transferId, domainId: transfer.domainId },
    });

    return c.json({
      success: true,
      message: 'Domain transfer rejected',
    });
  }
);

/**
 * Cancel domain transfer
 * POST /xrpc/io.exprsn.admin.domains.transfer.cancel
 */
adminDomainTransfersRouter.post(
  '/io.exprsn.admin.domains.transfer.cancel',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DOMAINS),
  async (c) => {
    const body = await c.req.json<{
      transferId: string;
      reason?: string;
    }>();

    const actorDid = c.get('did');

    if (!body.transferId) {
      throw new HTTPException(400, { message: 'Transfer ID is required' });
    }

    // Fetch transfer
    const [transfer] = await db
      .select()
      .from(domainTransfers)
      .where(eq(domainTransfers.id, body.transferId))
      .limit(1);

    if (!transfer) {
      throw new HTTPException(404, { message: 'Transfer not found' });
    }

    if (transfer.status !== 'pending') {
      throw new HTTPException(400, {
        message: `Transfer cannot be cancelled. Current status: ${transfer.status}`,
      });
    }

    // Fetch domain
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, transfer.domainId))
      .limit(1);

    if (!domain) {
      throw new HTTPException(404, { message: 'Domain not found' });
    }

    // Update transfer status
    await db
      .update(domainTransfers)
      .set({
        status: 'cancelled',
        cancelledBy: actorDid,
        cancelledAt: new Date(),
        adminNotes: body.reason,
        updatedAt: new Date(),
      })
      .where(eq(domainTransfers.id, body.transferId));

    // Log activity
    await db.insert(domainActivityLog).values({
      id: nanoid(),
      domainId: transfer.domainId,
      actorDid,
      action: 'transfer_cancelled',
      targetType: 'transfer',
      targetId: body.transferId,
      metadata: {
        reason: body.reason,
        cancelledBy: actorDid,
      },
    });

    // Notify relevant parties
    await notifyAdmins({
      type: 'domain_transfer_cancelled',
      title: 'Domain Transfer Cancelled',
      message: `Domain "${domain.name}" transfer was cancelled`,
      data: {
        transferId: body.transferId,
        domainId: transfer.domainId,
        domainName: domain.name,
      },
    });

    // Broadcast admin activity
    await broadcastAdminActivity({
      type: 'domain_transfer_cancelled',
      actorDid,
      actorHandle: actorDid,
      message: `Cancelled transfer for domain "${domain.name}"`,
      metadata: { transferId: body.transferId, domainId: transfer.domainId },
    });

    return c.json({
      success: true,
      message: 'Domain transfer cancelled',
    });
  }
);

/**
 * List pending transfers
 * GET /xrpc/io.exprsn.admin.domains.transfer.pending
 */
adminDomainTransfersRouter.get(
  '/io.exprsn.admin.domains.transfer.pending',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DOMAINS),
  async (c) => {
    const domainId = c.req.query('domainId');
    const organizationId = c.req.query('organizationId');
    const direction = c.req.query('direction'); // 'incoming' | 'outgoing'
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db
      .select({
        transfer: domainTransfers,
        domain: domains,
        sourceOrg: organizations,
        targetOrg: organizations,
      })
      .from(domainTransfers)
      .leftJoin(domains, eq(domainTransfers.domainId, domains.id))
      .leftJoin(
        organizations,
        eq(domainTransfers.sourceOrganizationId, organizations.id)
      )
      .leftJoin(
        organizations,
        eq(domainTransfers.targetOrganizationId, organizations.id)
      )
      .where(eq(domainTransfers.status, 'pending'))
      .orderBy(desc(domainTransfers.initiatedAt))
      .limit(limit)
      .offset(offset);

    // Filter by domain
    if (domainId) {
      query = query.where(eq(domainTransfers.domainId, domainId)) as typeof query;
    }

    // Filter by organization and direction
    if (organizationId && direction) {
      if (direction === 'incoming') {
        query = query.where(eq(domainTransfers.targetOrganizationId, organizationId)) as typeof query;
      } else if (direction === 'outgoing') {
        query = query.where(eq(domainTransfers.sourceOrganizationId, organizationId)) as typeof query;
      }
    } else if (organizationId) {
      // Show both incoming and outgoing
      query = query.where(
        or(
          eq(domainTransfers.sourceOrganizationId, organizationId),
          eq(domainTransfers.targetOrganizationId, organizationId)
        )
      ) as typeof query;
    }

    const results = await query;

    return c.json({
      transfers: results.map((r) => ({
        ...r.transfer,
        domain: r.domain,
        sourceOrganization: r.sourceOrg,
        targetOrganization: r.targetOrg,
      })),
      pagination: {
        limit,
        offset,
        total: results.length,
      },
    });
  }
);

/**
 * Get transfer history for a domain
 * GET /xrpc/io.exprsn.admin.domains.transfer.history
 */
adminDomainTransfersRouter.get(
  '/io.exprsn.admin.domains.transfer.history',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DOMAINS),
  async (c) => {
    const domainId = c.req.query('domainId');
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    if (!domainId) {
      throw new HTTPException(400, { message: 'Domain ID is required' });
    }

    const transfers = await db
      .select({
        transfer: domainTransfers,
        domain: domains,
        sourceOrg: organizations,
        targetOrg: organizations,
      })
      .from(domainTransfers)
      .leftJoin(domains, eq(domainTransfers.domainId, domains.id))
      .leftJoin(
        organizations,
        eq(domainTransfers.sourceOrganizationId, organizations.id)
      )
      .leftJoin(
        organizations,
        eq(domainTransfers.targetOrganizationId, organizations.id)
      )
      .where(eq(domainTransfers.domainId, domainId))
      .orderBy(desc(domainTransfers.initiatedAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      transfers: transfers.map((r) => ({
        ...r.transfer,
        domain: r.domain,
        sourceOrganization: r.sourceOrg,
        targetOrganization: r.targetOrg,
      })),
      pagination: {
        limit,
        offset,
        total: transfers.length,
      },
    });
  }
);

/**
 * Get single transfer details
 * GET /xrpc/io.exprsn.admin.domains.transfer.get
 */
adminDomainTransfersRouter.get(
  '/io.exprsn.admin.domains.transfer.get',
  requirePermission(ADMIN_PERMISSIONS.MANAGE_DOMAINS),
  async (c) => {
    const transferId = c.req.query('transferId');

    if (!transferId) {
      throw new HTTPException(400, { message: 'Transfer ID is required' });
    }

    const [result] = await db
      .select({
        transfer: domainTransfers,
        domain: domains,
        sourceOrg: organizations,
        targetOrg: organizations,
      })
      .from(domainTransfers)
      .leftJoin(domains, eq(domainTransfers.domainId, domains.id))
      .leftJoin(
        organizations,
        eq(domainTransfers.sourceOrganizationId, organizations.id)
      )
      .leftJoin(
        organizations,
        eq(domainTransfers.targetOrganizationId, organizations.id)
      )
      .where(eq(domainTransfers.id, transferId))
      .limit(1);

    if (!result) {
      throw new HTTPException(404, { message: 'Transfer not found' });
    }

    return c.json({
      transfer: {
        ...result.transfer,
        domain: result.domain,
        sourceOrganization: result.sourceOrg,
        targetOrganization: result.targetOrg,
      },
    });
  }
);
