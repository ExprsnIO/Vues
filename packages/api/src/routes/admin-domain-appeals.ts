/**
 * Admin Domain Appeals Routes
 * Handles appeals workflow for domain moderation actions
 */

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { createAppealsService } from '../services/moderation/AppealsService.js';

export const adminDomainAppealsRouter = new Hono();

// Apply admin auth to all routes
adminDomainAppealsRouter.use('*', adminAuthMiddleware);

/**
 * List appeals for a domain
 * GET /xrpc/io.exprsn.admin.domains.appeals.list
 */
adminDomainAppealsRouter.get(
  '/io.exprsn.admin.domains.appeals.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    try {
      const domainId = c.req.query('domainId');
      const status = c.req.query('status');
      const limit = parseInt(c.req.query('limit') || '50', 10);
      const offset = parseInt(c.req.query('offset') || '0', 10);

      if (!domainId) {
        return c.json({ error: 'domainId is required' }, 400);
      }

      const appealsService = createAppealsService();

      // Build filters
      const filters: any = { domainId };
      if (status && status !== 'all') {
        filters.status = status;
      }

      const result = await appealsService.getAppealsQueue(filters, {
        page: Math.floor(offset / limit) + 1,
        limit,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      // Get stats
      const stats = await appealsService.getStats(domainId, 'all');

      // Fetch user info for each appeal
      const appealsWithUsers = await Promise.all(
        result.appeals.map(async (appeal) => {
          const userResult = await db.execute(sql`
            SELECT did, handle, display_name, avatar
            FROM users
            WHERE did = ${appeal.userId}
            LIMIT 1
          `);

          const user = userResult.rows[0] as any;

          return {
            ...appeal,
            user: user ? {
              did: user.did,
              handle: user.handle,
              displayName: user.display_name,
              avatar: user.avatar,
            } : undefined,
          };
        })
      );

      return c.json({
        appeals: appealsWithUsers,
        total: result.total,
        stats: {
          pending: stats.pending,
          in_review: stats.inReview,
          awaiting_info: 0, // Add if needed
          resolved: stats.resolved,
          withdrawn: stats.withdrawn,
        },
      });
    } catch (error) {
      console.error('Failed to list appeals:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to list appeals' }, 500);
    }
  }
);

/**
 * Get appeal by ID with details
 * GET /xrpc/io.exprsn.admin.domains.appeals.get
 */
adminDomainAppealsRouter.get(
  '/io.exprsn.admin.domains.appeals.get',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    try {
      const domainId = c.req.query('domainId');
      const appealId = c.req.query('appealId');

      if (!domainId || !appealId) {
        return c.json({ error: 'domainId and appealId are required' }, 400);
      }

      const appealsService = createAppealsService();
      const appeal = await appealsService.getAppeal(appealId);

      if (!appeal || appeal.domainId !== domainId) {
        return c.json({ error: 'Appeal not found' }, 404);
      }

      // Fetch user info
      const userResult = await db.execute(sql`
        SELECT did, handle, display_name, avatar
        FROM users
        WHERE did = ${appeal.userId}
        LIMIT 1
      `);

      const user = userResult.rows[0] as any;

      return c.json({
        appeal: {
          ...appeal,
          user: user ? {
            did: user.did,
            handle: user.handle,
            displayName: user.display_name,
            avatar: user.avatar,
          } : undefined,
        },
      });
    } catch (error) {
      console.error('Failed to get appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to get appeal' }, 500);
    }
  }
);

/**
 * Make decision on an appeal
 * POST /xrpc/io.exprsn.admin.domains.appeals.decide
 */
adminDomainAppealsRouter.post(
  '/io.exprsn.admin.domains.appeals.decide',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    try {
      const body = await c.req.json<{
        domainId: string;
        appealId: string;
        outcome: 'upheld' | 'overturned' | 'partially_overturned' | 'dismissed';
        reason: string;
        reinstateContent?: boolean;
        removeAction?: boolean;
        internalNotes?: string;
      }>();

      const adminUser = c.get('adminUser');

      if (!body.domainId || !body.appealId || !body.outcome || !body.reason) {
        return c.json({ error: 'domainId, appealId, outcome, and reason are required' }, 400);
      }

      const appealsService = createAppealsService();

      // Verify appeal belongs to this domain
      const appeal = await appealsService.getAppeal(body.appealId);
      if (!appeal || appeal.domainId !== body.domainId) {
        return c.json({ error: 'Appeal not found' }, 404);
      }

      // Make decision
      const decision = {
        appealId: body.appealId,
        outcome: body.outcome,
        reason: body.reason,
        reinstateContent: body.reinstateContent,
        removeAction: body.removeAction,
        notifyUser: true,
        internalNotes: body.internalNotes,
      };

      const result = await appealsService.decideAppeal(decision, adminUser.userDid);

      return c.json({
        success: true,
        appeal: result,
      });
    } catch (error) {
      console.error('Failed to decide appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to decide appeal' }, 500);
    }
  }
);

/**
 * Request additional information from user
 * POST /xrpc/io.exprsn.admin.domains.appeals.requestInfo
 */
adminDomainAppealsRouter.post(
  '/io.exprsn.admin.domains.appeals.requestInfo',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    try {
      const body = await c.req.json<{
        domainId: string;
        appealId: string;
        question: string;
        deadline?: string;
      }>();

      const adminUser = c.get('adminUser');

      if (!body.domainId || !body.appealId || !body.question) {
        return c.json({ error: 'domainId, appealId, and question are required' }, 400);
      }

      const appealsService = createAppealsService();

      // Verify appeal belongs to this domain
      const appeal = await appealsService.getAppeal(body.appealId);
      if (!appeal || appeal.domainId !== body.domainId) {
        return c.json({ error: 'Appeal not found' }, 404);
      }

      await appealsService.requestInfo(
        body.appealId,
        {
          question: body.question,
          deadline: body.deadline ? new Date(body.deadline) : undefined,
        },
        adminUser.userDid
      );

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to request info:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to request info' }, 500);
    }
  }
);

/**
 * Escalate appeal to senior moderator
 * POST /xrpc/io.exprsn.admin.domains.appeals.escalate
 */
adminDomainAppealsRouter.post(
  '/io.exprsn.admin.domains.appeals.escalate',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    try {
      const body = await c.req.json<{
        domainId: string;
        appealId: string;
        reason: string;
      }>();

      const adminUser = c.get('adminUser');

      if (!body.domainId || !body.appealId || !body.reason) {
        return c.json({ error: 'domainId, appealId, and reason are required' }, 400);
      }

      const appealsService = createAppealsService();

      // Verify appeal belongs to this domain
      const appeal = await appealsService.getAppeal(body.appealId);
      if (!appeal || appeal.domainId !== body.domainId) {
        return c.json({ error: 'Appeal not found' }, 404);
      }

      // Record escalation in history
      await db.execute(sql`
        INSERT INTO appeal_history (id, appeal_id, action, actor, actor_type, details, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${body.appealId},
          'appeal_escalated',
          ${adminUser.userDid},
          'moderator',
          ${JSON.stringify({ reason: body.reason })},
          CURRENT_TIMESTAMP
        )
      `);

      // Update priority to high/critical
      await db.execute(sql`
        UPDATE moderation_appeals
        SET priority = 'high', updated_at = CURRENT_TIMESTAMP
        WHERE id = ${body.appealId}
      `);

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to escalate appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to escalate appeal' }, 500);
    }
  }
);

/**
 * Add internal note to appeal
 * POST /xrpc/io.exprsn.admin.domains.appeals.addNote
 */
adminDomainAppealsRouter.post(
  '/io.exprsn.admin.domains.appeals.addNote',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    try {
      const body = await c.req.json<{
        domainId: string;
        appealId: string;
        note: string;
      }>();

      const adminUser = c.get('adminUser');

      if (!body.domainId || !body.appealId || !body.note) {
        return c.json({ error: 'domainId, appealId, and note are required' }, 400);
      }

      const appealsService = createAppealsService();

      // Verify appeal belongs to this domain
      const appeal = await appealsService.getAppeal(body.appealId);
      if (!appeal || appeal.domainId !== body.domainId) {
        return c.json({ error: 'Appeal not found' }, 404);
      }

      // Add note to history
      await db.execute(sql`
        INSERT INTO appeal_history (id, appeal_id, action, actor, actor_type, details, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${body.appealId},
          'note_added',
          ${adminUser.userDid},
          'moderator',
          ${JSON.stringify({ note: body.note })},
          CURRENT_TIMESTAMP
        )
      `);

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to add note:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to add note' }, 500);
    }
  }
);

/**
 * Assign appeal to current moderator
 * POST /xrpc/io.exprsn.admin.domains.appeals.assignToMe
 */
adminDomainAppealsRouter.post(
  '/io.exprsn.admin.domains.appeals.assignToMe',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    try {
      const body = await c.req.json<{
        domainId: string;
        appealId: string;
      }>();

      const adminUser = c.get('adminUser');

      if (!body.domainId || !body.appealId) {
        return c.json({ error: 'domainId and appealId are required' }, 400);
      }

      const appealsService = createAppealsService();

      // Verify appeal belongs to this domain
      const appeal = await appealsService.getAppeal(body.appealId);
      if (!appeal || appeal.domainId !== body.domainId) {
        return c.json({ error: 'Appeal not found' }, 404);
      }

      await appealsService.assignAppeal(body.appealId, adminUser.userDid);

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to assign appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to assign appeal' }, 500);
    }
  }
);

/**
 * Get appeal history/timeline
 * GET /xrpc/io.exprsn.admin.domains.appeals.history
 */
adminDomainAppealsRouter.get(
  '/io.exprsn.admin.domains.appeals.history',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    try {
      const domainId = c.req.query('domainId');
      const appealId = c.req.query('appealId');

      if (!domainId || !appealId) {
        return c.json({ error: 'domainId and appealId are required' }, 400);
      }

      const appealsService = createAppealsService();

      // Verify appeal belongs to this domain
      const appeal = await appealsService.getAppeal(appealId);
      if (!appeal || appeal.domainId !== domainId) {
        return c.json({ error: 'Appeal not found' }, 404);
      }

      const history = await appealsService.getHistory(appealId);

      return c.json({
        history: history.map(entry => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('Failed to get appeal history:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to get history' }, 500);
    }
  }
);

/**
 * Legacy review endpoint (for backward compatibility)
 * POST /xrpc/io.exprsn.admin.domains.appeals.review
 */
adminDomainAppealsRouter.post(
  '/io.exprsn.admin.domains.appeals.review',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    try {
      const body = await c.req.json<{
        domainId: string;
        id: string;
        decision: string;
        note?: string;
      }>();

      const adminUser = c.get('adminUser');

      if (!body.domainId || !body.id || !body.decision) {
        return c.json({ error: 'domainId, id, and decision are required' }, 400);
      }

      const appealsService = createAppealsService();

      // Map legacy decision to outcome
      const outcomeMap: Record<string, 'upheld' | 'overturned' | 'dismissed'> = {
        'approved': 'overturned',
        'rejected': 'upheld',
        'denied': 'upheld',
      };

      const outcome = outcomeMap[body.decision] || 'upheld';

      const decision = {
        appealId: body.id,
        outcome,
        reason: body.note || `Appeal ${body.decision}`,
        notifyUser: true,
      };

      await appealsService.decideAppeal(decision, adminUser.userDid);

      return c.json({ success: true });
    } catch (error) {
      console.error('Failed to review appeal:', error);
      return c.json({ error: error instanceof Error ? error.message : 'Failed to review appeal' }, 500);
    }
  }
);
