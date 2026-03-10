import { Hono } from 'hono';
import { eq, desc, and, sql, count, ilike } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  ssoProviders,
  platformDirectories,
  liveStreams,
  users,
} from '../db/schema.js';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';

export const adminPlatformRouter = new Hono();

// Apply admin auth to all routes
adminPlatformRouter.use('*', adminAuthMiddleware);

// ============================================
// Global SSO/Authentication Providers
// ============================================

/**
 * List all global SSO providers
 */
adminPlatformRouter.get(
  '/io.exprsn.admin.auth.listProviders',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_VIEW),
  async (c) => {
    const search = c.req.query('search');
    const type = c.req.query('type');
    const status = c.req.query('status');

    let query = db.select().from(ssoProviders);

    const conditions = [];
    if (search) {
      conditions.push(ilike(ssoProviders.name, `%${search}%`));
    }
    if (type) {
      conditions.push(eq(ssoProviders.type, type));
    }
    if (status) {
      conditions.push(eq(ssoProviders.status, status));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const providers = await query.orderBy(desc(ssoProviders.createdAt));

    // Add placeholder domain counts (could be computed from usage tracking)
    const providersWithCounts = providers.map((p) => ({
      ...p,
      domainCount: 0, // TODO: implement provider-domain linking
    }));

    // Get stats
    const totalCount = providers.length;
    const activeCount = providers.filter((p) => p.status === 'active').length;
    const oauthCount = providers.filter((p) => p.type === 'oauth2' || p.type === 'oidc').length;
    const samlLdapCount = providers.filter((p) => p.type === 'saml' || p.type === 'ldap').length;

    return c.json({
      providers: providersWithCounts,
      stats: {
        total: totalCount,
        active: activeCount,
        oauth: oauthCount,
        samlLdap: samlLdapCount,
      },
    });
  }
);

/**
 * Get a specific SSO provider
 */
adminPlatformRouter.get(
  '/io.exprsn.admin.auth.getProvider',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_VIEW),
  async (c) => {
    const providerId = c.req.query('providerId');
    if (!providerId) {
      return c.json({ error: 'InvalidRequest', message: 'providerId is required' }, 400);
    }

    const [provider] = await db
      .select()
      .from(ssoProviders)
      .where(eq(ssoProviders.id, providerId));

    if (!provider) {
      return c.json({ error: 'NotFound', message: 'Provider not found' }, 404);
    }

    return c.json({
      provider: {
        ...provider,
        domainCount: 0, // TODO: implement provider-domain linking
      },
    });
  }
);

/**
 * Create a new SSO provider
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.auth.createProvider',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const {
      name,
      type,
      clientId,
      clientSecret,
      issuerUrl,
      authorizationUrl,
      tokenUrl,
      userInfoUrl,
      scopes,
      attributeMapping,
    } = body;

    if (!name || !type) {
      return c.json({ error: 'InvalidRequest', message: 'name and type are required' }, 400);
    }

    const providerId = `sso_${nanoid(12)}`;

    await db.insert(ssoProviders).values({
      id: providerId,
      name,
      type,
      status: 'inactive',
      clientId,
      clientSecret,
      issuerUrl,
      authorizationUrl,
      tokenUrl,
      userInfoUrl,
      scopes: scopes || [],
      attributeMapping: attributeMapping || {},
    });

    const [provider] = await db
      .select()
      .from(ssoProviders)
      .where(eq(ssoProviders.id, providerId));

    return c.json({ provider });
  }
);

/**
 * Update an SSO provider
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.auth.updateProvider',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const { providerId, ...updates } = body;

    if (!providerId) {
      return c.json({ error: 'InvalidRequest', message: 'providerId is required' }, 400);
    }

    await db
      .update(ssoProviders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(ssoProviders.id, providerId));

    const [provider] = await db
      .select()
      .from(ssoProviders)
      .where(eq(ssoProviders.id, providerId));

    return c.json({ provider });
  }
);

/**
 * Delete an SSO provider
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.auth.deleteProvider',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    const { providerId } = await c.req.json();

    if (!providerId) {
      return c.json({ error: 'InvalidRequest', message: 'providerId is required' }, 400);
    }

    await db.delete(ssoProviders).where(eq(ssoProviders.id, providerId));

    return c.json({ success: true });
  }
);

// ============================================
// Platform Directories
// ============================================

/**
 * List platform directories
 */
adminPlatformRouter.get(
  '/io.exprsn.admin.directories.list',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_VIEW),
  async (c) => {
    const search = c.req.query('search');

    let query = db.select().from(platformDirectories);

    if (search) {
      query = query.where(ilike(platformDirectories.name, `%${search}%`)) as typeof query;
    }

    const directories = await query.orderBy(desc(platformDirectories.createdAt));

    // Calculate stats
    const totalRecords = directories.reduce((sum, d) => sum + (d.recordCount || 0), 0);
    const onlineCount = directories.filter((d) => d.status === 'online').length;
    const syncingCount = directories.filter((d) => d.status === 'syncing').length;

    return c.json({
      directories,
      stats: {
        total: directories.length,
        online: onlineCount,
        syncing: syncingCount,
        totalRecords,
      },
    });
  }
);

/**
 * Get directory details
 */
adminPlatformRouter.get(
  '/io.exprsn.admin.directories.get',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_VIEW),
  async (c) => {
    const directoryId = c.req.query('directoryId');
    if (!directoryId) {
      return c.json({ error: 'InvalidRequest', message: 'directoryId is required' }, 400);
    }

    const [directory] = await db
      .select()
      .from(platformDirectories)
      .where(eq(platformDirectories.id, directoryId));

    if (!directory) {
      return c.json({ error: 'NotFound', message: 'Directory not found' }, 404);
    }

    return c.json({ directory });
  }
);

/**
 * Create a new directory
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.directories.create',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const { name, url, description, isPrimary } = body;

    if (!name || !url) {
      return c.json({ error: 'InvalidRequest', message: 'name and url are required' }, 400);
    }

    const directoryId = `dir_${nanoid(12)}`;

    // If setting as primary, unset others
    if (isPrimary) {
      await db
        .update(platformDirectories)
        .set({ isPrimary: false })
        .where(eq(platformDirectories.isPrimary, true));
    }

    await db.insert(platformDirectories).values({
      id: directoryId,
      name,
      url,
      description,
      isPrimary: isPrimary || false,
      status: 'offline',
      version: '1.0.0',
      recordCount: 0,
    });

    const [directory] = await db
      .select()
      .from(platformDirectories)
      .where(eq(platformDirectories.id, directoryId));

    return c.json({ directory });
  }
);

/**
 * Update a directory
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.directories.update',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    const body = await c.req.json();
    const { directoryId, ...updates } = body;

    if (!directoryId) {
      return c.json({ error: 'InvalidRequest', message: 'directoryId is required' }, 400);
    }

    // If setting as primary, unset others
    if (updates.isPrimary) {
      await db
        .update(platformDirectories)
        .set({ isPrimary: false })
        .where(eq(platformDirectories.isPrimary, true));
    }

    await db
      .update(platformDirectories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(platformDirectories.id, directoryId));

    const [directory] = await db
      .select()
      .from(platformDirectories)
      .where(eq(platformDirectories.id, directoryId));

    return c.json({ directory });
  }
);

/**
 * Trigger directory sync
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.directories.sync',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    const { directoryId } = await c.req.json();

    if (!directoryId) {
      return c.json({ error: 'InvalidRequest', message: 'directoryId is required' }, 400);
    }

    // Update status to syncing
    await db
      .update(platformDirectories)
      .set({ status: 'syncing', updatedAt: new Date() })
      .where(eq(platformDirectories.id, directoryId));

    // In a real implementation, this would trigger an async sync job
    // For now, simulate completion after updating status
    setTimeout(async () => {
      await db
        .update(platformDirectories)
        .set({
          status: 'online',
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(platformDirectories.id, directoryId));
    }, 5000);

    const [directory] = await db
      .select()
      .from(platformDirectories)
      .where(eq(platformDirectories.id, directoryId));

    return c.json({ directory, message: 'Sync started' });
  }
);

/**
 * Delete a directory
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.directories.delete',
  requirePermission(ADMIN_PERMISSIONS.SETTINGS_MANAGE),
  async (c) => {
    const { directoryId } = await c.req.json();

    if (!directoryId) {
      return c.json({ error: 'InvalidRequest', message: 'directoryId is required' }, 400);
    }

    // Check if it's the primary directory
    const [directory] = await db
      .select()
      .from(platformDirectories)
      .where(eq(platformDirectories.id, directoryId));

    if (directory?.isPrimary) {
      return c.json(
        { error: 'CannotDeletePrimary', message: 'Cannot delete primary directory' },
        400
      );
    }

    await db.delete(platformDirectories).where(eq(platformDirectories.id, directoryId));

    return c.json({ success: true });
  }
);

// ============================================
// Live Stream Admin Stats
// ============================================

/**
 * Get live stream statistics for admin dashboard
 */
adminPlatformRouter.get(
  '/io.exprsn.admin.live.stats',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    // Get currently live count
    const [liveCountResult] = await db
      .select({ count: count() })
      .from(liveStreams)
      .where(eq(liveStreams.status, 'live'));

    // Get total viewers across all live streams
    const [viewersResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(${liveStreams.viewerCount}), 0)` })
      .from(liveStreams)
      .where(eq(liveStreams.status, 'live'));

    // Get scheduled streams count
    const [scheduledResult] = await db
      .select({ count: count() })
      .from(liveStreams)
      .where(eq(liveStreams.status, 'scheduled'));

    // Get streams today count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayResult] = await db
      .select({ count: count() })
      .from(liveStreams)
      .where(sql`${liveStreams.createdAt} >= ${today}`);

    // Get peak concurrent viewers today
    const [peakResult] = await db
      .select({ peak: sql<number>`COALESCE(MAX(${liveStreams.peakViewers}), 0)` })
      .from(liveStreams)
      .where(sql`${liveStreams.startedAt} >= ${today}`);

    // Get average stream duration (for ended streams today)
    const [avgDurationResult] = await db
      .select({
        avg: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${liveStreams.endedAt} - ${liveStreams.startedAt})) / 60), 0)`,
      })
      .from(liveStreams)
      .where(
        and(
          eq(liveStreams.status, 'ended'),
          sql`${liveStreams.endedAt} >= ${today}`
        )
      );

    return c.json({
      currentlyLive: liveCountResult?.count || 0,
      totalViewers: Number(viewersResult?.total || 0),
      scheduledStreams: scheduledResult?.count || 0,
      streamsToday: todayResult?.count || 0,
      peakConcurrentViewers: Number(peakResult?.peak || 0),
      avgStreamDuration: Math.round(Number(avgDurationResult?.avg || 0)),
    });
  }
);

/**
 * List live streams with user info
 */
adminPlatformRouter.get(
  '/io.exprsn.admin.live.list',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const search = c.req.query('search');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db
      .select({
        id: liveStreams.id,
        title: liveStreams.title,
        streamerDid: liveStreams.userDid,
        streamerHandle: users.handle,
        streamerAvatar: users.avatar,
        status: liveStreams.status,
        viewerCount: liveStreams.viewerCount,
        peakViewers: liveStreams.peakViewers,
        startedAt: liveStreams.startedAt,
        scheduledAt: liveStreams.scheduledAt,
        endedAt: liveStreams.endedAt,
        category: liveStreams.category,
        isAgeRestricted: liveStreams.isAgeRestricted,
        visibility: liveStreams.visibility,
        createdAt: liveStreams.createdAt,
      })
      .from(liveStreams)
      .leftJoin(users, eq(liveStreams.userDid, users.did));

    const conditions = [];
    if (status && status !== 'all') {
      conditions.push(eq(liveStreams.status, status));
    }
    if (search) {
      conditions.push(
        sql`(${liveStreams.title} ILIKE ${`%${search}%`} OR ${users.handle} ILIKE ${`%${search}%`})`
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const streams = await query
      .orderBy(desc(liveStreams.createdAt))
      .limit(limit)
      .offset(offset);

    // Calculate duration for ended streams
    const streamsWithDuration = streams.map((s) => {
      let duration: number | undefined;
      if (s.startedAt && s.endedAt) {
        duration = Math.round(
          (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000
        );
      }
      return { ...s, duration };
    });

    return c.json({ streams: streamsWithDuration });
  }
);

/**
 * End a live stream
 */
adminPlatformRouter.post(
  '/io.exprsn.admin.live.endStream',
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const { streamId, reason } = await c.req.json();

    if (!streamId) {
      return c.json({ error: 'InvalidRequest', message: 'streamId is required' }, 400);
    }

    const [stream] = await db
      .select()
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId));

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
        updatedAt: new Date(),
      })
      .where(eq(liveStreams.id, streamId));

    return c.json({ success: true, message: 'Stream ended' });
  }
);

export default adminPlatformRouter;
