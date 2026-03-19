/**
 * Transcode Progress WebSocket Handler
 * Real-time adaptive streaming transcode job progress updates using Socket.IO
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getOAuthClient } from '../auth/oauth-client.js';
import { hashSessionToken } from '../utils/session-tokens.js';

type NextFunction = (err?: Error) => void;

// Types
export interface TranscodeProgressUpdate {
  jobId: string;
  status: 'pending' | 'probing' | 'transcoding' | 'packaging' | 'uploading' | 'completed' | 'failed';
  phase: string;
  progress: number; // 0-100
  currentQuality?: string;
  message?: string;
  eta?: number; // seconds remaining
  error?: string;
}

export interface TranscodeJobComplete {
  jobId: string;
  videoUri?: string;
  userDid: string;
  hlsMasterUrl?: string;
  dashManifestUrl?: string;
  thumbnailSpriteUrl?: string;
  thumbnailVttUrl?: string;
  availableQualities: string[];
  duration?: number;
}

export interface TranscodeJobFailed {
  jobId: string;
  videoUri?: string;
  userDid: string;
  error: string;
  errorStack?: string;
  phase?: string;
}

// Redis for pub/sub
let redis: Redis | null = null;
let redisSub: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
} catch {
  console.warn('Redis not available for transcode progress');
}

// Track subscribed jobs: socketId -> Set<jobId>
const socketSubscriptions = new Map<string, Set<string>>();

// Socket to user mapping
const socketToUser = new Map<string, { did: string; handle: string }>();

// Global namespace reference for external emit
let transcodeNamespace: ReturnType<SocketIOServer['of']> | null = null;

/**
 * Emit transcode progress update (called from worker via Redis pub/sub)
 */
export function emitTranscodeProgress(progress: TranscodeProgressUpdate): void {
  if (transcodeNamespace) {
    transcodeNamespace.to(`job:${progress.jobId}`).emit('progress', progress);
  }

  // Also publish to Redis for multi-server support
  if (redis) {
    redis.publish('transcode-progress', JSON.stringify(progress));
  }
}

/**
 * Emit transcode job completion
 */
export function emitTranscodeComplete(update: TranscodeJobComplete): void {
  if (transcodeNamespace) {
    transcodeNamespace.to(`job:${update.jobId}`).emit('complete', update);
    // Also emit to user's room for any page they're on
    transcodeNamespace.to(`user:${update.userDid}`).emit('job-complete', update);
  }

  if (redis) {
    redis.publish('transcode-complete', JSON.stringify(update));
  }
}

/**
 * Emit transcode job failure
 */
export function emitTranscodeFailed(update: TranscodeJobFailed): void {
  if (transcodeNamespace) {
    transcodeNamespace.to(`job:${update.jobId}`).emit('failed', update);
    transcodeNamespace.to(`user:${update.userDid}`).emit('job-failed', update);
  }

  if (redis) {
    redis.publish('transcode-failed', JSON.stringify(update));
  }
}

/**
 * Initialize the transcode progress WebSocket namespace
 */
export function initializeTranscodeProgressWebSocket(io: SocketIOServer): void {
  transcodeNamespace = io.of('/transcode-progress');

  // Authentication middleware
  transcodeNamespace.use(async (socket: Socket, next: NextFunction) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      let authenticatedDid: string | null = null;

      // Check for local session token (prefixed with exp_)
      if (token.startsWith('exp_')) {
        // Hash the token to look it up (tokens are stored as hashes)
        const tokenHash = hashSessionToken(token);
        const session = await db.query.sessions.findFirst({
          where: eq(schema.sessions.accessJwt, tokenHash),
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
        where: eq(schema.users.did, authenticatedDid),
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
      console.error('Transcode WebSocket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  transcodeNamespace.on('connection', async (socket: Socket) => {
    const userDid = (socket as any).userDid as string;

    console.log(`TranscodeProgress: User connected: ${userDid}`);

    // Initialize subscriptions set for this socket
    socketSubscriptions.set(socket.id, new Set());

    // Join user's personal room for global job notifications
    socket.join(`user:${userDid}`);

    /**
     * Subscribe to a specific transcode job's progress
     */
    socket.on('subscribe', async (data: { jobId: string }) => {
      const { jobId } = data;

      // Verify user owns this job
      const [job] = await db
        .select()
        .from(schema.transcodeJobs)
        .where(eq(schema.transcodeJobs.id, jobId))
        .limit(1);

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
        phase: job.phase || 'init',
        progress: job.progress || 0,
      } as TranscodeProgressUpdate);

      console.log(`TranscodeProgress: ${userDid} subscribed to job ${jobId}`);
    });

    /**
     * Unsubscribe from a job's progress
     */
    socket.on('unsubscribe', (data: { jobId: string }) => {
      const { jobId } = data;

      socket.leave(`job:${jobId}`);
      socketSubscriptions.get(socket.id)?.delete(jobId);

      console.log(`TranscodeProgress: ${userDid} unsubscribed from job ${jobId}`);
    });

    /**
     * Subscribe to all transcode jobs for the user
     */
    socket.on('subscribe-all', async () => {
      // Get all active jobs for this user
      const jobs = await db
        .select()
        .from(schema.transcodeJobs)
        .where(eq(schema.transcodeJobs.userDid, userDid));

      const activeJobs = jobs.filter((j) =>
        ['pending', 'probing', 'transcoding', 'packaging', 'uploading'].includes(j.status)
      );

      for (const job of activeJobs) {
        socket.join(`job:${job.id}`);
        socketSubscriptions.get(socket.id)?.add(job.id);

        // Send current status
        socket.emit('progress', {
          jobId: job.id,
          status: job.status,
          phase: job.phase || 'init',
          progress: job.progress || 0,
        } as TranscodeProgressUpdate);
      }

      console.log(
        `TranscodeProgress: ${userDid} subscribed to all jobs (${activeJobs.length} active)`
      );
    });

    /**
     * Subscribe to a video's transcode status (by video URI)
     */
    socket.on('subscribe-video', async (data: { videoUri: string }) => {
      const { videoUri } = data;

      // Find transcode job for this video
      const [job] = await db
        .select()
        .from(schema.transcodeJobs)
        .where(eq(schema.transcodeJobs.videoUri, videoUri))
        .limit(1);

      if (!job) {
        socket.emit('error', { message: 'No transcode job found for video', videoUri });
        return;
      }

      if (job.userDid !== userDid) {
        socket.emit('error', { message: 'Not authorized', videoUri });
        return;
      }

      socket.join(`job:${job.id}`);
      socketSubscriptions.get(socket.id)?.add(job.id);

      // Send current status
      socket.emit('progress', {
        jobId: job.id,
        status: job.status,
        phase: job.phase || 'init',
        progress: job.progress || 0,
      } as TranscodeProgressUpdate);

      console.log(`TranscodeProgress: ${userDid} subscribed to video ${videoUri}`);
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', () => {
      socketSubscriptions.delete(socket.id);
      socketToUser.delete(socket.id);
      console.log(`TranscodeProgress: User disconnected: ${userDid}`);
    });
  });

  // Subscribe to Redis pub/sub for multi-server support
  if (redisSub) {
    redisSub.subscribe('transcode-progress', 'transcode-complete', 'transcode-failed');

    redisSub.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);

        if (channel === 'transcode-progress' && transcodeNamespace) {
          transcodeNamespace.to(`job:${data.jobId}`).emit('progress', data);
        } else if (channel === 'transcode-complete' && transcodeNamespace) {
          transcodeNamespace.to(`job:${data.jobId}`).emit('complete', data);
          if (data.userDid) {
            transcodeNamespace.to(`user:${data.userDid}`).emit('job-complete', data);
          }
        } else if (channel === 'transcode-failed' && transcodeNamespace) {
          transcodeNamespace.to(`job:${data.jobId}`).emit('failed', data);
          if (data.userDid) {
            transcodeNamespace.to(`user:${data.userDid}`).emit('job-failed', data);
          }
        }
      } catch (err) {
        console.error('Failed to process Redis message:', err);
      }
    });
  }

  console.log('Transcode progress WebSocket initialized on /transcode-progress');
}

/**
 * Get stats about connected clients
 */
export function getTranscodeProgressStats(): {
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

export default initializeTranscodeProgressWebSocket;
