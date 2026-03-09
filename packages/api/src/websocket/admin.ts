/**
 * Admin WebSocket Handler
 * Real-time admin dashboard stats and notifications using Socket.IO
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import {
  db,
  users,
  sessions,
  adminUsers,
  contentReports,
  userSanctions,
  renderJobs,
  userPresence,
} from '../db/index.js';
import { eq, sql, and, gte, count } from 'drizzle-orm';
import { getOAuthClient } from '../auth/oauth-client.js';
import { ROLE_PERMISSIONS, type AdminRole } from '../auth/middleware.js';

type NextFunction = (err?: Error) => void;

// Types
export interface AdminStats {
  activeUsers: number;
  totalUsers: number;
  newUsersToday: number;
  pendingReports: number;
  activeRenderJobs: number;
  queuedRenderJobs: number;
  activeSanctions: number;
  onlineAdmins: number;
  systemHealth: {
    api: 'healthy' | 'degraded' | 'down';
    database: 'healthy' | 'degraded' | 'down';
    redis: 'healthy' | 'degraded' | 'down';
    storage: 'healthy' | 'degraded' | 'down';
  };
}

export interface AdminNotification {
  id: string;
  type: 'report' | 'sanction' | 'user' | 'system' | 'render';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface AdminActivityEvent {
  adminDid: string;
  adminHandle: string;
  action: string;
  targetType?: string;
  targetId?: string;
  timestamp: string;
}

// Redis for pub/sub
let redis: Redis | null = null;
let redisSub: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
} catch {
  console.warn('Redis not available for admin WebSocket');
}

// Track connected admins
const connectedAdmins = new Map<
  string,
  { did: string; handle: string; role: AdminRole; socketId: string }
>();

// Global namespace reference
let adminNamespace: ReturnType<SocketIOServer['of']> | null = null;

// Stats cache
let cachedStats: AdminStats | null = null;
let lastStatsUpdate = 0;
const STATS_CACHE_TTL = 5000; // 5 seconds

/**
 * Get current admin stats
 */
async function getAdminStats(): Promise<AdminStats> {
  const now = Date.now();

  // Return cached stats if still fresh
  if (cachedStats && now - lastStatsUpdate < STATS_CACHE_TTL) {
    return cachedStats;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Run queries in parallel
    const [
      totalUsersResult,
      newUsersTodayResult,
      pendingReportsResult,
      activeRenderResult,
      queuedRenderResult,
      activeSanctionsResult,
      activeUsersResult,
    ] = await Promise.all([
      // Total users
      db.select({ count: count() }).from(users),

      // New users today
      db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, today)),

      // Pending reports
      db
        .select({ count: count() })
        .from(contentReports)
        .where(eq(contentReports.status, 'pending')),

      // Active render jobs
      db
        .select({ count: count() })
        .from(renderJobs)
        .where(eq(renderJobs.status, 'rendering')),

      // Queued render jobs
      db
        .select({ count: count() })
        .from(renderJobs)
        .where(eq(renderJobs.status, 'pending')),

      // Active sanctions (not expired)
      db
        .select({ count: count() })
        .from(userSanctions)
        .where(
          sql`${userSanctions.expiresAt} IS NULL OR ${userSanctions.expiresAt} > NOW()`
        ),

      // Active users (online in last 5 minutes)
      db
        .select({ count: count() })
        .from(userPresence)
        .where(sql`${userPresence.lastSeen} >= ${new Date(now - 5 * 60 * 1000).toISOString()}`),
    ]);

    // Check system health
    const systemHealth: AdminStats['systemHealth'] = {
      api: 'healthy',
      database: 'healthy',
      redis: redis ? 'healthy' : 'down',
      storage: 'healthy', // Would check S3/MinIO in production
    };

    // Test Redis if available
    if (redis) {
      try {
        await redis.ping();
      } catch {
        systemHealth.redis = 'down';
      }
    }

    cachedStats = {
      activeUsers: activeUsersResult[0]?.count || 0,
      totalUsers: totalUsersResult[0]?.count || 0,
      newUsersToday: newUsersTodayResult[0]?.count || 0,
      pendingReports: pendingReportsResult[0]?.count || 0,
      activeRenderJobs: activeRenderResult[0]?.count || 0,
      queuedRenderJobs: queuedRenderResult[0]?.count || 0,
      activeSanctions: activeSanctionsResult[0]?.count || 0,
      onlineAdmins: connectedAdmins.size,
      systemHealth,
    };

    lastStatsUpdate = now;
    return cachedStats;
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);

    // Return last cached stats or defaults
    return (
      cachedStats || {
        activeUsers: 0,
        totalUsers: 0,
        newUsersToday: 0,
        pendingReports: 0,
        activeRenderJobs: 0,
        queuedRenderJobs: 0,
        activeSanctions: 0,
        onlineAdmins: connectedAdmins.size,
        systemHealth: {
          api: 'healthy',
          database: 'degraded',
          redis: redis ? 'healthy' : 'down',
          storage: 'healthy',
        },
      }
    );
  }
}

/**
 * Broadcast stats to all connected admins
 */
async function broadcastStats(): Promise<void> {
  if (!adminNamespace) return;

  const stats = await getAdminStats();
  adminNamespace.emit('stats', stats);
}

/**
 * Send notification to all admins
 */
export function notifyAdmins(notification: Omit<AdminNotification, 'id' | 'timestamp'>): void {
  const fullNotification: AdminNotification = {
    ...notification,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  if (adminNamespace) {
    adminNamespace.emit('notification', fullNotification);
  }

  // Publish to Redis for multi-server support
  if (redis) {
    redis.publish('admin-notification', JSON.stringify(fullNotification));
  }
}

/**
 * Broadcast admin activity event
 */
export function broadcastAdminActivity(event: Omit<AdminActivityEvent, 'timestamp'>): void {
  const fullEvent: AdminActivityEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  if (adminNamespace) {
    adminNamespace.emit('admin-activity', fullEvent);
  }

  if (redis) {
    redis.publish('admin-activity', JSON.stringify(fullEvent));
  }
}

/**
 * Notify admins of a new report
 */
export function notifyNewReport(report: {
  id: string;
  contentType: string;
  reason: string;
  reporterHandle?: string;
}): void {
  notifyAdmins({
    type: 'report',
    title: 'New Report',
    message: `New ${report.contentType} report: ${report.reason}${
      report.reporterHandle ? ` by @${report.reporterHandle}` : ''
    }`,
    severity: 'warning',
    data: { reportId: report.id },
  });

  // Invalidate stats cache
  cachedStats = null;
}

/**
 * Notify admins of system events
 */
export function notifySystemEvent(event: {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}): void {
  notifyAdmins({
    type: 'system',
    ...event,
  });
}

/**
 * Get list of connected admins
 */
export function getConnectedAdmins(): Array<{
  did: string;
  handle: string;
  role: AdminRole;
}> {
  return Array.from(connectedAdmins.values()).map(({ did, handle, role }) => ({
    did,
    handle,
    role,
  }));
}

/**
 * Initialize the admin WebSocket namespace
 */
export function initializeAdminWebSocket(io: SocketIOServer): void {
  adminNamespace = io.of('/admin');

  // Authentication middleware - requires admin privileges
  adminNamespace.use(async (socket: Socket, next: NextFunction) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      let authenticatedDid: string | null = null;

      // Check for local session token (prefixed with exp_)
      if (token.startsWith('exp_')) {
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.accessJwt, token),
        });

        if (!session || session.expiresAt < new Date()) {
          return next(new Error('Invalid or expired session'));
        }

        authenticatedDid = session.did;
      } else {
        // Try OAuth token
        try {
          const oauthClient = getOAuthClient();
          const oauthSession = await oauthClient.restore(token);

          if (!oauthSession) {
            return next(new Error('Invalid or expired OAuth session'));
          }

          authenticatedDid = oauthSession.did;
        } catch {
          return next(new Error('Authentication failed'));
        }
      }

      if (!authenticatedDid) {
        return next(new Error('Authentication failed'));
      }

      // Check if user is an admin
      const adminUser = await db.query.adminUsers.findFirst({
        where: eq(adminUsers.userDid, authenticatedDid),
      });

      if (!adminUser) {
        return next(new Error('Admin access required'));
      }

      // Fetch user info
      const user = await db.query.users.findFirst({
        where: eq(users.did, authenticatedDid),
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Attach user info to socket
      (socket as any).userDid = authenticatedDid;
      (socket as any).userHandle = user.handle;
      (socket as any).adminRole = adminUser.role as AdminRole;
      (socket as any).adminId = adminUser.id;

      next();
    } catch (error) {
      console.error('Admin WebSocket auth error:', error);
      return next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  adminNamespace.on('connection', async (socket: Socket) => {
    const userDid = (socket as any).userDid as string;
    const userHandle = (socket as any).userHandle as string;
    const adminRole = (socket as any).adminRole as AdminRole;

    console.log(`Admin connected: @${userHandle} (${adminRole})`);

    // Track connected admin
    connectedAdmins.set(userDid, {
      did: userDid,
      handle: userHandle,
      role: adminRole,
      socketId: socket.id,
    });

    // Send initial stats
    const stats = await getAdminStats();
    socket.emit('stats', stats);

    // Send connected admins list
    socket.emit('connected-admins', getConnectedAdmins());

    // Broadcast to other admins that a new admin connected
    socket.broadcast.emit('admin-joined', {
      did: userDid,
      handle: userHandle,
      role: adminRole,
    });

    // Handle stats request
    socket.on('get-stats', async () => {
      const stats = await getAdminStats();
      socket.emit('stats', stats);
    });

    // Handle request for connected admins
    socket.on('get-connected-admins', () => {
      socket.emit('connected-admins', getConnectedAdmins());
    });

    // Handle admin activity broadcast
    socket.on('activity', (data: { action: string; targetType?: string; targetId?: string }) => {
      broadcastAdminActivity({
        adminDid: userDid,
        adminHandle: userHandle,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`Admin disconnected: @${userHandle}`);

      connectedAdmins.delete(userDid);

      // Broadcast to other admins
      socket.broadcast.emit('admin-left', {
        did: userDid,
        handle: userHandle,
      });
    });
  });

  // Subscribe to Redis channels for multi-server support
  if (redisSub) {
    redisSub.subscribe('admin-notification', 'admin-activity');

    redisSub.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);

        if (channel === 'admin-notification' && adminNamespace) {
          adminNamespace.emit('notification', data);
        } else if (channel === 'admin-activity' && adminNamespace) {
          adminNamespace.emit('admin-activity', data);
        }
      } catch (error) {
        console.error('Failed to process Redis message:', error);
      }
    });
  }

  // Broadcast stats every 10 seconds
  setInterval(broadcastStats, 10000);

  console.log('Admin WebSocket namespace initialized');
}
