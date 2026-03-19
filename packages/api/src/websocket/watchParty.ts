/**
 * Watch Party WebSocket Handler
 * Real-time synchronized video watching using Socket.IO
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  watchPartyService,
  type PlaybackState,
  type PartyMessage,
  type PartyParticipant,
  type PartyQueueItem,
} from '../services/watchParty/index.js';
import { hashSessionToken } from '../utils/session-tokens.js';

type NextFunction = (err?: Error) => void;

// Types
interface UserInfo {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface JoinPartyEvent {
  partyId: string;
}

interface LeavePartyEvent {
  partyId: string;
}

interface PlaybackControlEvent {
  partyId: string;
  action: 'play' | 'pause' | 'seek' | 'next';
  position?: number;
  videoUri?: string;
}

interface SendMessageEvent {
  partyId: string;
  text: string;
  messageType?: 'text' | 'emoji' | 'reaction';
}

interface SyncRequestEvent {
  partyId: string;
}

// Track connected sockets per party
const partyParticipants = new Map<string, Set<string>>(); // partyId -> Set<socketId>
const socketToUser = new Map<string, UserInfo>(); // socketId -> UserInfo
const socketToParty = new Map<string, string>(); // socketId -> partyId

// Sync state per party
const partyPlaybackState = new Map<string, PlaybackState>(); // partyId -> PlaybackState

// Position tolerance for sync (ms)
const SYNC_TOLERANCE = 2000;

// Heartbeat interval for position sync
const POSITION_SYNC_INTERVAL = 3000;

/**
 * Verify JWT token and return user info
 */
async function authenticateSocket(socket: Socket): Promise<UserInfo | null> {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) return null;

    // Hash the token to look it up (tokens are stored as hashes)
    const tokenHash = hashSessionToken(token);

    // Look up session
    const [session] = await db
      .select({
        userDid: sessions.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(sessions)
      .innerJoin(users, eq(users.did, sessions.did))
      .where(eq(sessions.accessJwt, tokenHash))
      .limit(1);

    if (!session) return null;

    return {
      did: session.userDid,
      handle: session.handle,
      displayName: session.displayName || undefined,
      avatar: session.avatar || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get all sockets in a party
 */
function getPartySockets(io: SocketIOServer, partyId: string): string[] {
  const sockets = partyParticipants.get(partyId);
  return sockets ? Array.from(sockets) : [];
}

/**
 * Broadcast to all participants in a party except sender
 */
function broadcastToParty(
  io: SocketIOServer,
  partyId: string,
  event: string,
  data: unknown,
  excludeSocketId?: string
): void {
  const sockets = getPartySockets(io, partyId);
  for (const socketId of sockets) {
    if (socketId !== excludeSocketId) {
      io.of('/watch-party').to(socketId).emit(event, data);
    }
  }
}

/**
 * Initialize watch party WebSocket handler
 */
export function initializeWatchPartyWebSocket(io: SocketIOServer): void {
  const namespace = io.of('/watch-party');

  // Authentication middleware
  namespace.use(async (socket: Socket, next: NextFunction) => {
    const user = await authenticateSocket(socket);
    if (!user) {
      return next(new Error('Authentication failed'));
    }
    socketToUser.set(socket.id, user);
    next();
  });

  namespace.on('connection', (socket: Socket) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.disconnect();
      return;
    }

    console.log(`[WatchParty] User connected: ${user.handle} (${socket.id})`);

    /**
     * Join a party room
     */
    socket.on('join-party', async (event: JoinPartyEvent) => {
      try {
        const { partyId } = event;
        const party = await watchPartyService.getParty(partyId);

        if (!party || party.status !== 'active') {
          socket.emit('error', { message: 'Party not found or ended' });
          return;
        }

        // Leave previous party if any
        const previousPartyId = socketToParty.get(socket.id);
        if (previousPartyId) {
          socket.leave(previousPartyId);
          partyParticipants.get(previousPartyId)?.delete(socket.id);
        }

        // Join new party
        socket.join(partyId);
        socketToParty.set(socket.id, partyId);

        if (!partyParticipants.has(partyId)) {
          partyParticipants.set(partyId, new Set());
        }
        partyParticipants.get(partyId)!.add(socket.id);

        // Update presence in database
        await watchPartyService.joinParty(user.did, party.inviteCode);

        // Get full party state
        const state = await watchPartyService.getPartyState(partyId);

        // Send party state to joining user
        socket.emit('party-state', state);

        // Notify other participants
        broadcastToParty(io, partyId, 'participant-joined', {
          participant: {
            userDid: user.did,
            user: {
              handle: user.handle,
              displayName: user.displayName,
              avatar: user.avatar,
            },
            role: 'viewer',
            isPresent: true,
          },
        }, socket.id);

        console.log(`[WatchParty] ${user.handle} joined party ${partyId}`);
      } catch (error) {
        console.error('[WatchParty] Error joining party:', error);
        socket.emit('error', { message: 'Failed to join party' });
      }
    });

    /**
     * Leave a party
     */
    socket.on('leave-party', async (event: LeavePartyEvent) => {
      try {
        const { partyId } = event;

        socket.leave(partyId);
        socketToParty.delete(socket.id);
        partyParticipants.get(partyId)?.delete(socket.id);

        // Update presence in database
        await watchPartyService.leaveParty(user.did, partyId);

        // Notify other participants
        broadcastToParty(io, partyId, 'participant-left', {
          userDid: user.did,
        });

        console.log(`[WatchParty] ${user.handle} left party ${partyId}`);
      } catch (error) {
        console.error('[WatchParty] Error leaving party:', error);
      }
    });

    /**
     * Playback control (host/cohost only)
     */
    socket.on('playback-control', async (event: PlaybackControlEvent) => {
      try {
        const { partyId, action, position, videoUri } = event;

        // Verify permission
        const canControl = await watchPartyService.canControlPlayback(partyId, user.did);
        if (!canControl) {
          socket.emit('error', { message: 'Only host or cohost can control playback' });
          return;
        }

        let newState: Partial<PlaybackState> = {};

        switch (action) {
          case 'play':
            newState = { isPlaying: true, position: position ?? 0 };
            break;
          case 'pause':
            newState = { isPlaying: false, position: position ?? 0 };
            break;
          case 'seek':
            if (position !== undefined) {
              newState = { position };
            }
            break;
          case 'next':
            const nextItem = await watchPartyService.nextVideo(partyId);
            if (nextItem) {
              newState = { videoUri: nextItem.videoUri, position: 0, isPlaying: true };
            } else {
              socket.emit('error', { message: 'No more videos in queue' });
              return;
            }
            break;
        }

        // Update state in database
        await watchPartyService.updatePlayback(partyId, newState);

        // Get updated state
        const updatedState = await watchPartyService.getPlaybackState(partyId);
        if (updatedState) {
          partyPlaybackState.set(partyId, updatedState);

          // Broadcast to all participants
          broadcastToParty(io, partyId, 'playback-update', {
            ...updatedState,
            controlledBy: user.did,
            action,
          });

          // Also send to the controller
          socket.emit('playback-update', {
            ...updatedState,
            controlledBy: user.did,
            action,
          });
        }

        console.log(`[WatchParty] ${user.handle} ${action} in party ${partyId}`);
      } catch (error) {
        console.error('[WatchParty] Error controlling playback:', error);
        socket.emit('error', { message: 'Failed to control playback' });
      }
    });

    /**
     * Position sync (host sends periodically when playing)
     */
    socket.on('position-sync', async (event: { partyId: string; position: number }) => {
      try {
        const { partyId, position } = event;

        // Verify permission
        const canControl = await watchPartyService.canControlPlayback(partyId, user.did);
        if (!canControl) return;

        // Update in-memory state
        const currentState = partyPlaybackState.get(partyId);
        if (currentState && currentState.isPlaying) {
          const updatedState: PlaybackState = {
            ...currentState,
            position,
            updatedAt: Date.now(),
          };
          partyPlaybackState.set(partyId, updatedState);

          // Broadcast to other participants
          broadcastToParty(io, partyId, 'position-sync', {
            position,
            timestamp: Date.now(),
          }, socket.id);
        }
      } catch (error) {
        console.error('[WatchParty] Error syncing position:', error);
      }
    });

    /**
     * Sync request (client asks for current state)
     */
    socket.on('sync-request', async (event: SyncRequestEvent) => {
      try {
        const { partyId } = event;
        const state = await watchPartyService.getPlaybackState(partyId);

        if (state) {
          socket.emit('playback-update', state);
        }
      } catch (error) {
        console.error('[WatchParty] Error handling sync request:', error);
      }
    });

    /**
     * Send chat message
     */
    socket.on('send-message', async (event: SendMessageEvent) => {
      try {
        const { partyId, text, messageType } = event;

        if (!text.trim()) return;

        const party = await watchPartyService.getParty(partyId);
        if (!party || !party.chatEnabled) {
          socket.emit('error', { message: 'Chat is disabled for this party' });
          return;
        }

        // Save message
        const message = await watchPartyService.sendMessage(
          partyId,
          user.did,
          text.trim(),
          messageType || 'text'
        );

        const messageData = {
          id: message.id,
          partyId: message.partyId,
          senderDid: message.senderDid,
          text: message.text,
          messageType: message.messageType,
          createdAt: message.createdAt.toISOString(),
          sender: {
            handle: user.handle,
            displayName: user.displayName,
            avatar: user.avatar,
          },
        };

        // Broadcast to all participants (including sender)
        namespace.to(partyId).emit('new-message', messageData);

        console.log(`[WatchParty] ${user.handle} sent message in party ${partyId}`);
      } catch (error) {
        console.error('[WatchParty] Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    /**
     * Queue updated notification
     */
    socket.on('queue-add', async (event: { partyId: string; videoUri: string }) => {
      try {
        const { partyId, videoUri } = event;

        const queueItem = await watchPartyService.addToQueue(partyId, videoUri, user.did);
        const queue = await watchPartyService.getQueue(partyId);

        // Broadcast queue update
        namespace.to(partyId).emit('queue-updated', { queue });

        console.log(`[WatchParty] ${user.handle} added video to queue in party ${partyId}`);
      } catch (error) {
        console.error('[WatchParty] Error adding to queue:', error);
        socket.emit('error', { message: 'Failed to add to queue' });
      }
    });

    /**
     * Heartbeat for presence
     */
    socket.on('heartbeat', () => {
      // Just acknowledge - presence is tracked by socket connection
      socket.emit('heartbeat-ack', { timestamp: Date.now() });
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', async () => {
      const partyId = socketToParty.get(socket.id);

      if (partyId) {
        partyParticipants.get(partyId)?.delete(socket.id);

        // Update presence in database
        await watchPartyService.leaveParty(user.did, partyId);

        // Notify other participants
        broadcastToParty(io, partyId, 'participant-left', {
          userDid: user.did,
        });
      }

      socketToParty.delete(socket.id);
      socketToUser.delete(socket.id);

      console.log(`[WatchParty] User disconnected: ${user.handle}`);
    });
  });

  console.log('[WatchParty] WebSocket namespace initialized at /watch-party');
}
