/**
 * Editor Collaboration WebSocket Handler
 * Real-time collaboration using Socket.IO and Yjs
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import * as Y from 'yjs';

type NextFunction = (err?: Error) => void;
import { Redis } from 'ioredis';
import { db, users, sessions } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getOAuthClient } from '../auth/oauth-client.js';

// Types
interface User {
  did: string;
  name: string;
  avatar?: string;
  color: string;
}

interface CursorPosition {
  x: number;
  y: number;
  trackId?: string;
  clipId?: string;
  frame?: number;
}

interface Selection {
  type: 'clip' | 'keyframe' | 'track' | 'region';
  ids: string[];
  trackId?: string;
  startFrame?: number;
  endFrame?: number;
}

interface PresenceData {
  user: User;
  cursor?: CursorPosition;
  selection?: Selection;
  activeView: 'timeline' | 'canvas' | 'inspector' | 'library';
  lastSeen: number;
}

interface ProjectRoom {
  projectId: string;
  doc: Y.Doc;
  presence: Map<string, PresenceData>;
  lastUpdate: number;
}

// Generate random user color
function generateUserColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 60%)`;
}

// Redis for persistence (optional)
let redis: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
} catch {
  console.warn('Redis not available for collaboration persistence');
}

// In-memory project rooms
const rooms = new Map<string, ProjectRoom>();

// User socket mapping
const userSockets = new Map<string, Set<string>>();

/**
 * Get or create a project room
 */
async function getOrCreateRoom(projectId: string): Promise<ProjectRoom> {
  let room = rooms.get(projectId);

  if (!room) {
    const doc = new Y.Doc();

    // Try to load from Redis
    if (redis) {
      try {
        const savedState = await redis.getBuffer(`collab:project:${projectId}`);
        if (savedState) {
          Y.applyUpdate(doc, savedState);
        }
      } catch (err) {
        console.error('Failed to load collaboration state:', err);
      }
    }

    room = {
      projectId,
      doc,
      presence: new Map(),
      lastUpdate: Date.now(),
    };

    rooms.set(projectId, room);

    // Set up document observer for persistence
    doc.on('update', async (update: Uint8Array) => {
      room!.lastUpdate = Date.now();

      if (redis) {
        try {
          const state = Y.encodeStateAsUpdate(doc);
          await redis.setex(
            `collab:project:${projectId}`,
            86400 * 7, // 7 days
            Buffer.from(state)
          );
        } catch (err) {
          console.error('Failed to save collaboration state:', err);
        }
      }
    });
  }

  return room;
}

/**
 * Initialize editor collaboration namespace
 */
export function initializeEditorCollab(io: SocketIOServer): void {
  const namespace = io.of('/editor-collab');

  // Authentication middleware
  namespace.use(async (socket: Socket, next: NextFunction) => {
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

      (socket as any).user = {
        did: user.did,
        name: user.displayName || user.handle,
        avatar: user.avatar || undefined,
        color: generateUserColor(),
      };

      next();
    } catch (error) {
      console.error('WebSocket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  namespace.on('connection', (socket: Socket) => {
    const user: User = (socket as any).user;
    console.log(`User connected to editor collab: ${user.did}`);

    // Track user sockets
    if (!userSockets.has(user.did)) {
      userSockets.set(user.did, new Set());
    }
    userSockets.get(user.did)!.add(socket.id);

    let currentProjectId: string | null = null;

    /**
     * Join a project room
     */
    socket.on('join-project', async (data: { projectId: string }) => {
      const { projectId } = data;

      // Leave previous project if any
      if (currentProjectId) {
        socket.leave(currentProjectId);

        const prevRoom = rooms.get(currentProjectId);
        if (prevRoom) {
          prevRoom.presence.delete(user.did);
          socket.to(currentProjectId).emit('presence-leave', { userDid: user.did });
        }
      }

      // Join new project
      currentProjectId = projectId;
      socket.join(projectId);

      const room = await getOrCreateRoom(projectId);

      // Add user presence
      const presence: PresenceData = {
        user,
        activeView: 'timeline',
        lastSeen: Date.now(),
      };
      room.presence.set(user.did, presence);

      // Send current document state
      const state = Y.encodeStateAsUpdate(room.doc);
      socket.emit('sync-state', {
        state: Array.from(state),
        version: room.doc.clientID,
      });

      // Send current presence
      const presenceList = Array.from(room.presence.values());
      socket.emit('presence-sync', presenceList);

      // Notify others
      socket.to(projectId).emit('presence-join', presence);

      console.log(`User ${user.did} joined project ${projectId}`);
    });

    /**
     * Leave project room
     */
    socket.on('leave-project', () => {
      if (currentProjectId) {
        const room = rooms.get(currentProjectId);
        if (room) {
          room.presence.delete(user.did);
          socket.to(currentProjectId).emit('presence-leave', { userDid: user.did });
        }

        socket.leave(currentProjectId);
        currentProjectId = null;
      }
    });

    /**
     * Handle Yjs document updates
     */
    socket.on('yjs-update', (data: { update: number[] }) => {
      if (!currentProjectId) return;

      const room = rooms.get(currentProjectId);
      if (!room) return;

      const update = new Uint8Array(data.update);

      // Apply update to document
      Y.applyUpdate(room.doc, update);

      // Broadcast to other clients
      socket.to(currentProjectId).emit('yjs-update', {
        update: data.update,
        origin: user.did,
      });
    });

    /**
     * Handle cursor movement
     */
    socket.on('cursor-move', (data: CursorPosition) => {
      if (!currentProjectId) return;

      const room = rooms.get(currentProjectId);
      if (!room) return;

      const presence = room.presence.get(user.did);
      if (presence) {
        presence.cursor = data;
        presence.lastSeen = Date.now();
      }

      socket.to(currentProjectId).emit('cursor-update', {
        userDid: user.did,
        cursor: data,
      });
    });

    /**
     * Handle selection change
     */
    socket.on('selection-change', (data: Selection) => {
      if (!currentProjectId) return;

      const room = rooms.get(currentProjectId);
      if (!room) return;

      const presence = room.presence.get(user.did);
      if (presence) {
        presence.selection = data;
        presence.lastSeen = Date.now();
      }

      socket.to(currentProjectId).emit('selection-update', {
        userDid: user.did,
        selection: data,
      });
    });

    /**
     * Handle active view change
     */
    socket.on('view-change', (data: { view: PresenceData['activeView'] }) => {
      if (!currentProjectId) return;

      const room = rooms.get(currentProjectId);
      if (!room) return;

      const presence = room.presence.get(user.did);
      if (presence) {
        presence.activeView = data.view;
        presence.lastSeen = Date.now();
      }

      socket.to(currentProjectId).emit('view-update', {
        userDid: user.did,
        view: data.view,
      });
    });

    /**
     * Request awareness sync (for reconnection)
     */
    socket.on('sync-awareness', () => {
      if (!currentProjectId) return;

      const room = rooms.get(currentProjectId);
      if (!room) return;

      const presenceList = Array.from(room.presence.values());
      socket.emit('presence-sync', presenceList);
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', () => {
      console.log(`User disconnected from editor collab: ${user.did}`);

      // Remove socket from user tracking
      const sockets = userSockets.get(user.did);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(user.did);
        }
      }

      // Remove from room if no other connections
      if (currentProjectId && !userSockets.has(user.did)) {
        const room = rooms.get(currentProjectId);
        if (room) {
          room.presence.delete(user.did);
          socket.to(currentProjectId).emit('presence-leave', { userDid: user.did });
        }
      }
    });
  });

  // Cleanup inactive rooms periodically
  setInterval(() => {
    const now = Date.now();
    const maxInactiveTime = 1000 * 60 * 30; // 30 minutes

    for (const [projectId, room] of rooms) {
      if (room.presence.size === 0 && now - room.lastUpdate > maxInactiveTime) {
        room.doc.destroy();
        rooms.delete(projectId);
        console.log(`Cleaned up inactive room: ${projectId}`);
      }
    }
  }, 1000 * 60 * 5); // Every 5 minutes
}

/**
 * Get room statistics
 */
export function getCollabStats(): {
  activeRooms: number;
  totalUsers: number;
  roomDetails: Array<{ projectId: string; userCount: number }>;
} {
  const roomDetails = Array.from(rooms.entries()).map(([projectId, room]) => ({
    projectId,
    userCount: room.presence.size,
  }));

  return {
    activeRooms: rooms.size,
    totalUsers: userSockets.size,
    roomDetails,
  };
}

export default initializeEditorCollab;
