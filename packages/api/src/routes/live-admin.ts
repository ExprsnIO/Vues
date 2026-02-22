import { Hono } from 'hono';
import { eq, desc, and, sql, count, sum } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { liveStreams, streamViewers, users } from '../db/schema.js';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';

export const liveAdminRouter = new Hono();

// Apply admin auth to all routes
liveAdminRouter.use('*', adminAuthMiddleware);

// ============================================
// Dashboard & Stats
// ============================================

/**
 * Get live stream statistics
 */
liveAdminRouter.get(
  '/io.exprsn.admin.live.getStats',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    // Get currently live count
    const [liveCountResult] = await db
      .select({ count: count() })
      .from(liveStreams)
      .where(eq(liveStreams.status, 'live'));

    // Get total viewers across all live streams
    const [viewersResult] = await db
      .select({ total: sum(liveStreams.viewerCount) })
      .from(liveStreams)
      .where(eq(liveStreams.status, 'live'));

    // Get scheduled streams count
    const [scheduledResult] = await db
      .select({ count: count() })
      .from(liveStreams)
      .where(eq(liveStreams.status, 'scheduled'));

    // Get peak concurrent viewers today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [peakResult] = await db
      .select({ peak: sql`MAX(${liveStreams.peakViewers})` })
      .from(liveStreams)
      .where(
        and(
          eq(liveStreams.status, 'ended'),
          sql`${liveStreams.startedAt} >= ${today}`
        )
      );

    return c.json({
      currentlyLive: liveCountResult?.count || 0,
      totalViewers: Number(viewersResult?.total || 0),
      scheduled: scheduledResult?.count || 0,
      peakConcurrent: Number(peakResult?.peak || 0),
    });
  }
);

// ============================================
// Stream Management
// ============================================

/**
 * List live streams
 */
liveAdminRouter.get(
  '/io.exprsn.admin.live.listStreams',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db
      .select({
        stream: liveStreams,
        user: {
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(liveStreams)
      .leftJoin(users, eq(liveStreams.userDid, users.did));

    if (status) {
      query = query.where(eq(liveStreams.status, status)) as typeof query;
    }

    const results = await query
      .orderBy(desc(liveStreams.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      streams: results.map(({ stream, user }) => ({
        id: stream.id,
        userDid: stream.userDid,
        user: user
          ? {
              handle: user.handle,
              displayName: user.displayName,
              avatar: user.avatar,
            }
          : null,
        title: stream.title,
        description: stream.description,
        thumbnailUrl: stream.thumbnailUrl,
        status: stream.status,
        viewerCount: stream.viewerCount,
        peakViewers: stream.peakViewers,
        visibility: stream.visibility,
        chatEnabled: stream.chatEnabled,
        scheduledAt: stream.scheduledAt?.toISOString(),
        startedAt: stream.startedAt?.toISOString(),
        endedAt: stream.endedAt?.toISOString(),
        createdAt: stream.createdAt.toISOString(),
      })),
    });
  }
);

/**
 * Get stream details
 */
liveAdminRouter.get(
  '/io.exprsn.admin.live.getStream',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [result] = await db
      .select({
        stream: liveStreams,
        user: {
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(liveStreams)
      .leftJoin(users, eq(liveStreams.userDid, users.did))
      .where(eq(liveStreams.id, id))
      .limit(1);

    if (!result) {
      return c.json({ error: 'NotFound', message: 'Stream not found' }, 404);
    }

    const { stream, user } = result;

    // Get viewer history if stream is live or ended
    let viewerHistory: { time: string; count: number }[] = [];
    if (stream.status === 'live' || stream.status === 'ended') {
      // For now, return empty - would need viewer tracking implementation
      viewerHistory = [];
    }

    return c.json({
      id: stream.id,
      userDid: stream.userDid,
      user: user
        ? {
            handle: user.handle,
            displayName: user.displayName,
            avatar: user.avatar,
          }
        : null,
      title: stream.title,
      description: stream.description,
      thumbnailUrl: stream.thumbnailUrl,
      status: stream.status,
      streamKey: stream.streamKey, // Admin can see stream key
      ingestUrl: stream.ingestUrl,
      playbackUrl: stream.playbackUrl,
      viewerCount: stream.viewerCount,
      peakViewers: stream.peakViewers,
      visibility: stream.visibility,
      chatEnabled: stream.chatEnabled,
      scheduledAt: stream.scheduledAt?.toISOString(),
      startedAt: stream.startedAt?.toISOString(),
      endedAt: stream.endedAt?.toISOString(),
      createdAt: stream.createdAt.toISOString(),
      viewerHistory,
    });
  }
);

/**
 * End a live stream (admin action)
 */
liveAdminRouter.post(
  '/io.exprsn.admin.live.endStream',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const { id, reason } = await c.req.json<{ id: string; reason?: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [stream] = await db
      .select()
      .from(liveStreams)
      .where(eq(liveStreams.id, id))
      .limit(1);

    if (!stream) {
      return c.json({ error: 'NotFound', message: 'Stream not found' }, 404);
    }

    if (stream.status !== 'live') {
      return c.json({ error: 'InvalidState', message: 'Stream is not live' }, 400);
    }

    await db
      .update(liveStreams)
      .set({
        status: 'ended',
        endedAt: new Date(),
      })
      .where(eq(liveStreams.id, id));

    // TODO: Send notification to streamer
    // TODO: Actually terminate the stream via media server

    return c.json({ success: true });
  }
);

/**
 * Update stream settings (admin)
 */
liveAdminRouter.post(
  '/io.exprsn.admin.live.updateStream',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const body = await c.req.json<{
      id: string;
      visibility?: boolean;
      chatEnabled?: boolean;
    }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const updates: Record<string, unknown> = {};
    if (body.visibility !== undefined) updates.visibility = body.visibility;
    if (body.chatEnabled !== undefined) updates.chatEnabled = body.chatEnabled;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'InvalidRequest', message: 'No updates provided' }, 400);
    }

    await db.update(liveStreams).set(updates).where(eq(liveStreams.id, body.id));

    return c.json({ success: true });
  }
);

/**
 * Delete a stream (admin)
 */
liveAdminRouter.post(
  '/io.exprsn.admin.live.deleteStream',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    // Delete viewers first
    await db.delete(streamViewers).where(eq(streamViewers.streamId, id));

    // Delete stream
    await db.delete(liveStreams).where(eq(liveStreams.id, id));

    return c.json({ success: true });
  }
);

// ============================================
// Viewer Management
// ============================================

/**
 * Get current viewers for a stream
 */
liveAdminRouter.get(
  '/io.exprsn.admin.live.getViewers',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const streamId = c.req.query('streamId');

    if (!streamId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing streamId' }, 400);
    }

    const viewers = await db
      .select({
        viewer: streamViewers,
        user: {
          handle: users.handle,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(streamViewers)
      .leftJoin(users, eq(streamViewers.userDid, users.did))
      .where(
        and(
          eq(streamViewers.streamId, streamId),
          sql`${streamViewers.leftAt} IS NULL`
        )
      )
      .orderBy(desc(streamViewers.joinedAt))
      .limit(100);

    return c.json({
      viewers: viewers.map(({ viewer, user }) => ({
        id: viewer.id,
        userDid: viewer.userDid,
        user: user
          ? {
              handle: user.handle,
              displayName: user.displayName,
              avatar: user.avatar,
            }
          : null,
        sessionId: viewer.sessionId,
        joinedAt: viewer.joinedAt.toISOString(),
      })),
    });
  }
);

export default liveAdminRouter;
