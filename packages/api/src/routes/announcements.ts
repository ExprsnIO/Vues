import { Hono } from 'hono';
import { eq, desc, and, or, gte, lte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { announcements } from '../db/schema.js';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';

export const announcementsRouter = new Hono();

// ============================================
// Public Endpoints
// ============================================

/**
 * Get active announcements for the current user
 */
announcementsRouter.get('/io.exprsn.announcements.getActive', async (c) => {
  const now = new Date();

  const activeAnnouncements = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.status, 'active'),
        or(
          sql`${announcements.startsAt} IS NULL`,
          lte(announcements.startsAt, now)
        ),
        or(
          sql`${announcements.endsAt} IS NULL`,
          gte(announcements.endsAt, now)
        )
      )
    )
    .orderBy(desc(announcements.createdAt))
    .limit(10);

  return c.json({
    announcements: activeAnnouncements.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      type: a.type,
      dismissible: a.dismissible,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

/**
 * Record a view for an announcement
 */
announcementsRouter.post('/io.exprsn.announcements.recordView', async (c) => {
  const { id } = await c.req.json<{ id: string }>();

  if (!id) {
    return c.json({ error: 'InvalidRequest', message: 'Missing announcement id' }, 400);
  }

  await db
    .update(announcements)
    .set({ viewCount: sql`${announcements.viewCount} + 1` })
    .where(eq(announcements.id, id));

  return c.json({ success: true });
});

/**
 * Record a dismiss for an announcement
 */
announcementsRouter.post('/io.exprsn.announcements.recordDismiss', async (c) => {
  const { id } = await c.req.json<{ id: string }>();

  if (!id) {
    return c.json({ error: 'InvalidRequest', message: 'Missing announcement id' }, 400);
  }

  await db
    .update(announcements)
    .set({ dismissCount: sql`${announcements.dismissCount} + 1` })
    .where(eq(announcements.id, id));

  return c.json({ success: true });
});

// ============================================
// Admin Endpoints
// ============================================

const adminRouter = new Hono();
adminRouter.use('*', adminAuthMiddleware);

/**
 * List all announcements (admin)
 */
adminRouter.get(
  '/io.exprsn.admin.announcements.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50', 10);

    let query = db.select().from(announcements);

    if (status) {
      query = query.where(eq(announcements.status, status)) as typeof query;
    }

    const results = await query.orderBy(desc(announcements.createdAt)).limit(limit);

    return c.json({
      announcements: results.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        type: a.type,
        status: a.status,
        targetAudience: a.targetAudience,
        dismissible: a.dismissible,
        startsAt: a.startsAt?.toISOString(),
        endsAt: a.endsAt?.toISOString(),
        viewCount: a.viewCount,
        dismissCount: a.dismissCount,
        createdBy: a.createdBy,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    });
  }
);

/**
 * Get single announcement (admin)
 */
adminRouter.get(
  '/io.exprsn.admin.announcements.get',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [announcement] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);

    if (!announcement) {
      return c.json({ error: 'NotFound', message: 'Announcement not found' }, 404);
    }

    return c.json({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      status: announcement.status,
      targetAudience: announcement.targetAudience,
      dismissible: announcement.dismissible,
      startsAt: announcement.startsAt?.toISOString(),
      endsAt: announcement.endsAt?.toISOString(),
      viewCount: announcement.viewCount,
      dismissCount: announcement.dismissCount,
      createdBy: announcement.createdBy,
      createdAt: announcement.createdAt.toISOString(),
      updatedAt: announcement.updatedAt.toISOString(),
    });
  }
);

/**
 * Create announcement (admin)
 */
adminRouter.post(
  '/io.exprsn.admin.announcements.create',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminDid = c.get('did');
    const body = await c.req.json<{
      title: string;
      content: string;
      type?: string;
      status?: string;
      targetAudience?: string;
      dismissible?: boolean;
      startsAt?: string;
      endsAt?: string;
    }>();

    if (!body.title || !body.content) {
      return c.json({ error: 'InvalidRequest', message: 'Missing title or content' }, 400);
    }

    const id = nanoid();
    const now = new Date();

    await db.insert(announcements).values({
      id,
      title: body.title,
      content: body.content,
      type: body.type || 'info',
      status: body.status || 'draft',
      targetAudience: body.targetAudience || 'all',
      dismissible: body.dismissible ?? true,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      createdBy: adminDid,
      createdAt: now,
      updatedAt: now,
    });

    return c.json({ id }, 201);
  }
);

/**
 * Update announcement (admin)
 */
adminRouter.post(
  '/io.exprsn.admin.announcements.update',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      title?: string;
      content?: string;
      type?: string;
      status?: string;
      targetAudience?: string;
      dismissible?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [existing] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, body.id))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Announcement not found' }, 404);
    }

    const updates: Partial<typeof existing> = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.type !== undefined) updates.type = body.type;
    if (body.status !== undefined) updates.status = body.status;
    if (body.targetAudience !== undefined) updates.targetAudience = body.targetAudience;
    if (body.dismissible !== undefined) updates.dismissible = body.dismissible;
    if (body.startsAt !== undefined) updates.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.endsAt !== undefined) updates.endsAt = body.endsAt ? new Date(body.endsAt) : null;

    await db.update(announcements).set(updates).where(eq(announcements.id, body.id));

    return c.json({ success: true });
  }
);

/**
 * Delete announcement (admin)
 */
adminRouter.post(
  '/io.exprsn.admin.announcements.delete',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db.delete(announcements).where(eq(announcements.id, id));

    return c.json({ success: true });
  }
);

/**
 * Activate announcement (admin)
 */
adminRouter.post(
  '/io.exprsn.admin.announcements.activate',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db
      .update(announcements)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(announcements.id, id));

    return c.json({ success: true });
  }
);

/**
 * Deactivate announcement (admin)
 */
adminRouter.post(
  '/io.exprsn.admin.announcements.deactivate',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db
      .update(announcements)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(announcements.id, id));

    return c.json({ success: true });
  }
);

// Mount admin routes
announcementsRouter.route('/', adminRouter);

export default announcementsRouter;
