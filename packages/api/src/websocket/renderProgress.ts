/**
 * Render Progress WebSocket Handler
 * Real-time render job progress updates using Socket.IO
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { db, users, renderJobs, sessions } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getOAuthClient } from '../auth/oauth-client.js';

type NextFunction = (err?: Error) => void;

// Types
export interface RenderProgress {
  jobId: string;
  status: 'pending' | 'queued' | 'rendering' | 'encoding' | 'uploading' | 'completed' | 'failed' | 'paused';
  progress: number; // 0-100
  currentStep?: string;
  currentTime?: number;
  totalTime?: number;
  fps?: number;
  eta?: number; // seconds remaining
  error?: string;
}

export interface RenderJobUpdate {
  jobId: string;
  projectId: string;
  userDid: string;
  status: string;
  progress: number;
  outputUrl?: string;
  outputKey?: string;
  fileSize?: number;
  duration?: number;
  error?: string;
}

// Redis for pub/sub
let redis: Redis | null = null;
let redisSub: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
} catch {
  console.warn('Redis not available for render progress');
}

// Track subscribed jobs: socketId -> Set<jobId>
const socketSubscriptions = new Map<string, Set<string>>();

// Socket to user mapping
const socketToUser = new Map<string, { did: string; handle: string }>();

// Global namespace reference for external emit
let renderNamespace: ReturnType<SocketIOServer['of']> | null = null;

/**
 * Emit render progress update (called from worker via Redis pub/sub)
 */
export function emitRenderProgress(progress: RenderProgress): void {
  if (renderNamespace) {
    renderNamespace.to(`job:${progress.jobId}`).emit('progress', progress);
  }

  // Also publish to Redis for multi-server support
  if (redis) {
    redis.publish('render-progress', JSON.stringify(progress));
  }
}

/**
 * Emit render job completion
 */
export function emitRenderComplete(update: RenderJobUpdate): void {
  if (renderNamespace) {
    renderNamespace.to(`job:${update.jobId}`).emit('complete', update);
    // Also emit to user's room for any page they're on
    renderNamespace.to(`user:${update.userDid}`).emit('job-complete', update);
  }

  if (redis) {
    redis.publish('render-complete', JSON.stringify(update));
  }
}

/**
 * Emit render job failure
 */
export function emitRenderFailed(update: RenderJobUpdate): void {
  if (renderNamespace) {
    renderNamespace.to(`job:${update.jobId}`).emit('failed', update);
    renderNamespace.to(`user:${update.userDid}`).emit('job-failed', update);
  }

  if (redis) {
    redis.publish('render-failed', JSON.stringify(update));
  }
}

/**
 * Initialize the render progress WebSocket namespace
 */
export function initializeRenderProgressWebSocket(io: SocketIOServer): void {
  renderNamespace = io.of('/render-progress');

  // Authentication middleware
  renderNamespace.use(async (socket: Socket, next: NextFunction) => {
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

      // Fetch user info from database
      const user = await db.query.users.findFirst({
        where: eq(users.did, authenticatedDid),
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      (socket as any).userDid = authenticatedDid;
      socketToUser.set(socket.id, {
        did: user.did,
        handle: user.handle,
      });

      next();
    } catch (error) {
      console.error('Render WebSocket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  renderNamespace.on('connection', async (socket: Socket) => {
    const userDid = (socket as any).userDid as string;

    console.log(`RenderProgress: User connected: ${userDid}`);

    // Initialize subscriptions set for this socket
    socketSubscriptions.set(socket.id, new Set());

    // Join user's personal room for global job notifications
    socket.join(`user:${userDid}`);

    /**
     * Subscribe to a specific job's progress
     */
    socket.on('subscribe', async (data: { jobId: string }) => {
      const { jobId } = data;

      // Verify user owns this job
      const job = await db.query.renderJobs.findFirst({
        where: eq(renderJobs.id, jobId),
      });

      if (!job) {
        socket.emit('error', { message: 'Job not found', jobId });
        return;
      }

      if (job.userDid !== userDid) {
        socket.emit('error', { message: 'Not authorized', jobId });
        return;
      }

      // Add to room and track subscription
      socket.join(`job:${jobId}`);
      socketSubscriptions.get(socket.id)?.add(jobId);

      // Send current status immediately
      socket.emit('progress', {
        jobId: job.id,
        status: job.status,
        progress: job.progress || 0,
        currentStep: job.currentStep,
      } as RenderProgress);

      console.log(`RenderProgress: ${userDid} subscribed to job ${jobId}`);
    });

    /**
     * Unsubscribe from a job's progress
     */
    socket.on('unsubscribe', (data: { jobId: string }) => {
      const { jobId } = data;

      socket.leave(`job:${jobId}`);
      socketSubscriptions.get(socket.id)?.delete(jobId);

      console.log(`RenderProgress: ${userDid} unsubscribed from job ${jobId}`);
    });

    /**
     * Subscribe to all jobs for a project
     */
    socket.on('subscribe-project', async (data: { projectId: string }) => {
      const { projectId } = data;

      // Get all active jobs for this project owned by the user
      const jobs = await db.query.renderJobs.findMany({
        where: eq(renderJobs.projectId, projectId),
      });

      const userJobs = jobs.filter((j) => j.userDid === userDid);

      for (const job of userJobs) {
        socket.join(`job:${job.id}`);
        socketSubscriptions.get(socket.id)?.add(job.id);

        // Send current status
        socket.emit('progress', {
          jobId: job.id,
          status: job.status,
          progress: job.progress || 0,
          currentStep: job.currentStep,
        } as RenderProgress);
      }

      // Also join project room for new jobs
      socket.join(`project:${projectId}`);

      console.log(
        `RenderProgress: ${userDid} subscribed to project ${projectId} (${userJobs.length} jobs)`
      );
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', () => {
      socketSubscriptions.delete(socket.id);
      socketToUser.delete(socket.id);
      console.log(`RenderProgress: User disconnected: ${userDid}`);
    });
  });

  // Subscribe to Redis pub/sub for multi-server support
  if (redisSub) {
    redisSub.subscribe('render-progress', 'render-complete', 'render-failed');

    redisSub.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);

        if (channel === 'render-progress' && renderNamespace) {
          renderNamespace.to(`job:${data.jobId}`).emit('progress', data);
        } else if (channel === 'render-complete' && renderNamespace) {
          renderNamespace.to(`job:${data.jobId}`).emit('complete', data);
          if (data.userDid) {
            renderNamespace.to(`user:${data.userDid}`).emit('job-complete', data);
          }
        } else if (channel === 'render-failed' && renderNamespace) {
          renderNamespace.to(`job:${data.jobId}`).emit('failed', data);
          if (data.userDid) {
            renderNamespace.to(`user:${data.userDid}`).emit('job-failed', data);
          }
        }
      } catch (err) {
        console.error('Failed to process Redis message:', err);
      }
    });
  }

  console.log('Render progress WebSocket initialized on /render-progress');
}

/**
 * Get stats about connected clients
 */
export function getRenderProgressStats(): {
  connectedClients: number;
  activeSubscriptions: number;
} {
  let activeSubscriptions = 0;
  for (const subs of socketSubscriptions.values()) {
    activeSubscriptions += subs.size;
  }

  return {
    connectedClients: socketToUser.size,
    activeSubscriptions,
  };
}

export default initializeRenderProgressWebSocket;
