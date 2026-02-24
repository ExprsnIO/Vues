/**
 * Live Stream Chat WebSocket Handler
 * Real-time chat for live streams using Socket.IO
 */

import type { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { Redis } from 'ioredis';
import {
  db,
  users,
  liveStreams,
  streamChat,
  streamModerators,
  streamBannedUsers,
  sessions,
} from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getOAuthClient } from '../auth/oauth-client.js';

// Types
interface UserInfo {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  isModerator?: boolean;
  isHost?: boolean;
}

interface ChatMessage {
  id: string;
  streamId: string;
  sender: UserInfo;
  text: string;
  messageType: 'chat' | 'system' | 'highlight';
  createdAt: string;
}

interface ChatSettings {
  slowMode: boolean;
  slowModeInterval: number;
  subscriberOnly: boolean;
  emoteOnly: boolean;
}

// Redis for pub/sub across instances
let redis: Redis | null = null;
let redisSub: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
} catch {
  console.warn('Redis not available for live chat');
}

// Track connected viewers per stream
const streamViewers = new Map<string, Set<string>>();
// Socket to user mapping
const socketToUser = new Map<string, UserInfo & { streamId?: string }>();
// User last message time (for slow mode)
const userLastMessage = new Map<string, number>();
// Stream settings cache
const streamSettings = new Map<string, ChatSettings>();
// Pinned message per stream
const pinnedMessages = new Map<string, ChatMessage | null>();

/**
 * Verify session token and return user info
 */
async function verifySession(token: string): Promise<UserInfo | null> {
  try {
    const oauthClient = await getOAuthClient();
    const session = await oauthClient.restore(token);
    if (!session) return null;

    const userDid = session.sub;

    const user = await db.query.users.findFirst({
      where: eq(users.did, userDid),
    });

    if (!user) return null;

    return {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName || undefined,
      avatar: user.avatar || undefined,
    };
  } catch {
    // Fallback to simple session lookup
    try {
      const sessionRecord = await db.query.sessions.findFirst({
        where: eq(sessions.accessJwt, token),
      });

      if (!sessionRecord) return null;

      const user = await db.query.users.findFirst({
        where: eq(users.did, sessionRecord.did),
      });

      if (!user) return null;

      return {
        did: user.did,
        handle: user.handle,
        displayName: user.displayName || undefined,
        avatar: user.avatar || undefined,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Check if user is moderator for stream
 */
async function isUserModerator(userDid: string, streamId: string): Promise<boolean> {
  const stream = await db.query.liveStreams.findFirst({
    where: eq(liveStreams.id, streamId),
  });

  // Host is always a moderator
  if (stream?.userDid === userDid) return true;

  const mod = await db.query.streamModerators.findFirst({
    where: and(
      eq(streamModerators.streamId, streamId),
      eq(streamModerators.userDid, userDid)
    ),
  });

  return !!mod;
}

/**
 * Check if user is banned from stream chat
 */
async function isUserBanned(userDid: string, streamId: string): Promise<boolean> {
  const ban = await db.query.streamBannedUsers.findFirst({
    where: and(
      eq(streamBannedUsers.streamId, streamId),
      eq(streamBannedUsers.userDid, userDid)
    ),
  });

  if (!ban) return false;

  // Check if ban has expired
  if (ban.expiresAt && new Date(ban.expiresAt) < new Date()) {
    await db.delete(streamBannedUsers).where(eq(streamBannedUsers.id, ban.id));
    return false;
  }

  return true;
}

/**
 * Initialize Live Chat WebSocket
 */
export function initializeLiveChatWebSocket(io: SocketIOServer): Namespace {
  const liveChat = io.of('/live-chat');

  // Authentication middleware
  liveChat.use(async (socket, next) => {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const user = await verifySession(token as string);
    if (!user) {
      return next(new Error('Invalid session'));
    }

    socketToUser.set(socket.id, user);
    next();
  });

  liveChat.on('connection', (socket: Socket) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.disconnect();
      return;
    }

    console.log(`[Live Chat] User connected: ${user.handle}`);

    // Join stream chat room
    socket.on('join-stream', async (streamId: string) => {
      try {
        const stream = await db.query.liveStreams.findFirst({
          where: eq(liveStreams.id, streamId),
        });

        if (!stream || stream.status !== 'live') {
          socket.emit('error', { message: 'Stream not found or not live' });
          return;
        }

        if (await isUserBanned(user.did, streamId)) {
          socket.emit('error', { message: 'You are banned from this chat' });
          return;
        }

        const isMod = await isUserModerator(user.did, streamId);
        const isHost = stream.userDid === user.did;

        socketToUser.set(socket.id, { ...user, streamId, isModerator: isMod, isHost });

        if (!streamViewers.has(streamId)) {
          streamViewers.set(streamId, new Set());
        }
        streamViewers.get(streamId)!.add(socket.id);

        socket.join(`stream:${streamId}`);

        const viewerCount = streamViewers.get(streamId)?.size || 0;
        liveChat.to(`stream:${streamId}`).emit('viewer-count', { count: viewerCount });

        let settings = streamSettings.get(streamId);
        if (!settings) {
          settings = { slowMode: false, slowModeInterval: 5, subscriberOnly: false, emoteOnly: false };
          streamSettings.set(streamId, settings);
        }
        socket.emit('chat-settings', settings);

        const pinned = pinnedMessages.get(streamId);
        if (pinned) {
          socket.emit('pinned-message', pinned);
        }

        // Send recent messages
        const recentMessages = await db
          .select({
            chat: streamChat,
            user: users,
          })
          .from(streamChat)
          .innerJoin(users, eq(streamChat.userDid, users.did))
          .where(eq(streamChat.streamId, streamId))
          .orderBy(desc(streamChat.createdAt))
          .limit(50);

        socket.emit('chat-history', {
          messages: recentMessages.reverse().map((m) => ({
            id: m.chat.id,
            streamId: m.chat.streamId,
            sender: {
              did: m.user.did,
              handle: m.user.handle,
              displayName: m.user.displayName,
              avatar: m.user.avatar,
            },
            text: m.chat.message,
            messageType: m.chat.messageType === 'text' ? 'chat' : m.chat.messageType,
            createdAt: m.chat.createdAt.toISOString(),
          })),
        });

        socket.emit('joined', { streamId, viewerCount, isModerator: isMod, isHost });
      } catch (error) {
        console.error('[Live Chat] Join error:', error);
        socket.emit('error', { message: 'Failed to join stream' });
      }
    });

    socket.on('leave-stream', () => {
      const userData = socketToUser.get(socket.id);
      if (userData?.streamId) {
        leaveStream(socket, userData.streamId);
      }
    });

    socket.on('send-message', async (data: { text: string }) => {
      const userData = socketToUser.get(socket.id);
      if (!userData?.streamId) {
        socket.emit('error', { message: 'Not in a stream' });
        return;
      }

      const { streamId } = userData;
      const { text } = data;

      if (!text || text.trim().length === 0) return;
      if (text.length > 500) {
        socket.emit('error', { message: 'Message too long (max 500 characters)' });
        return;
      }

      if (await isUserBanned(userData.did, streamId)) {
        socket.emit('error', { message: 'You are banned from this chat' });
        return;
      }

      const settings = streamSettings.get(streamId);
      if (settings?.slowMode && !userData.isModerator) {
        const lastTime = userLastMessage.get(`${userData.did}:${streamId}`);
        if (lastTime) {
          const elapsed = (Date.now() - lastTime) / 1000;
          if (elapsed < settings.slowModeInterval) {
            const remaining = Math.ceil(settings.slowModeInterval - elapsed);
            socket.emit('error', { message: `Slow mode: wait ${remaining}s` });
            return;
          }
        }
      }

      const messageId = nanoid();
      const message: ChatMessage = {
        id: messageId,
        streamId,
        sender: {
          did: userData.did,
          handle: userData.handle,
          displayName: userData.displayName,
          avatar: userData.avatar,
          isModerator: userData.isModerator,
          isHost: userData.isHost,
        },
        text: text.trim(),
        messageType: 'chat',
        createdAt: new Date().toISOString(),
      };

      try {
        await db.insert(streamChat).values({
          id: messageId,
          streamId,
          userDid: userData.did,
          message: text.trim(),
          messageType: 'text',
          createdAt: new Date(),
        });

        userLastMessage.set(`${userData.did}:${streamId}`, Date.now());
        liveChat.to(`stream:${streamId}`).emit('chat-message', message);

        if (redis) {
          redis.publish(`live-chat:${streamId}`, JSON.stringify({ type: 'message', data: message }));
        }
      } catch (error) {
        console.error('[Live Chat] Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('delete-message', async (data: { messageId: string; reason?: string }) => {
      const userData = socketToUser.get(socket.id);
      if (!userData?.streamId || (!userData.isModerator && !userData.isHost)) {
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      try {
        await db
          .update(streamChat)
          .set({ isDeleted: true })
          .where(eq(streamChat.id, data.messageId));

        liveChat.to(`stream:${userData.streamId}`).emit('message-deleted', {
          messageId: data.messageId,
          deletedBy: userData.handle,
          reason: data.reason,
        });
      } catch (error) {
        console.error('[Live Chat] Delete message error:', error);
      }
    });

    socket.on('ban-user', async (data: { userDid: string; duration?: number; reason?: string }) => {
      const userData = socketToUser.get(socket.id);
      if (!userData?.streamId || (!userData.isModerator && !userData.isHost)) {
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      try {
        const expiresAt = data.duration ? new Date(Date.now() + data.duration * 1000) : null;

        await db.insert(streamBannedUsers).values({
          id: nanoid(),
          streamId: userData.streamId,
          userDid: data.userDid,
          bannedBy: userData.did,
          reason: data.reason || null,
          expiresAt,
          createdAt: new Date(),
        });

        // Disconnect banned user
        streamViewers.get(userData.streamId)?.forEach((socketId) => {
          const u = socketToUser.get(socketId);
          if (u?.did === data.userDid) {
            const s = liveChat.sockets.get(socketId);
            if (s) {
              s.emit('user-banned', { reason: data.reason, duration: data.duration });
              s.disconnect();
            }
          }
        });

        liveChat.to(`stream:${userData.streamId}`).emit('user-banned', {
          userDid: data.userDid,
          bannedBy: userData.handle,
          reason: data.reason,
          duration: data.duration,
        });
      } catch (error) {
        console.error('[Live Chat] Ban user error:', error);
      }
    });

    socket.on('update-settings', (data: Partial<ChatSettings>) => {
      const userData = socketToUser.get(socket.id);
      if (!userData?.streamId || !userData.isHost) {
        socket.emit('error', { message: 'Only host can change settings' });
        return;
      }

      const currentSettings = streamSettings.get(userData.streamId) || {
        slowMode: false,
        slowModeInterval: 5,
        subscriberOnly: false,
        emoteOnly: false,
      };

      const newSettings = { ...currentSettings, ...data };
      streamSettings.set(userData.streamId, newSettings);
      liveChat.to(`stream:${userData.streamId}`).emit('chat-settings', newSettings);
    });

    socket.on('pin-message', (data: { message: ChatMessage | null }) => {
      const userData = socketToUser.get(socket.id);
      if (!userData?.streamId || (!userData.isModerator && !userData.isHost)) {
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      pinnedMessages.set(userData.streamId, data.message);
      liveChat.to(`stream:${userData.streamId}`).emit('pinned-message', data.message);
    });

    socket.on('heartbeat', () => {
      socket.emit('heartbeat-ack', { timestamp: Date.now() });
    });

    socket.on('disconnect', () => {
      const userData = socketToUser.get(socket.id);
      if (userData?.streamId) {
        leaveStream(socket, userData.streamId);
      }
      socketToUser.delete(socket.id);
      console.log(`[Live Chat] User disconnected: ${userData?.handle || 'unknown'}`);
    });
  });

  function leaveStream(socket: Socket, streamId: string) {
    streamViewers.get(streamId)?.delete(socket.id);
    socket.leave(`stream:${streamId}`);

    const viewerCount = streamViewers.get(streamId)?.size || 0;
    liveChat.to(`stream:${streamId}`).emit('viewer-count', { count: viewerCount });

    if (viewerCount === 0) {
      streamViewers.delete(streamId);
      streamSettings.delete(streamId);
      pinnedMessages.delete(streamId);
    }
  }

  if (redisSub) {
    redisSub.psubscribe('live-chat:*', (err) => {
      if (err) console.error('[Live Chat] Redis subscribe error:', err);
    });

    redisSub.on('pmessage', (pattern, channel, message) => {
      try {
        const streamId = channel.replace('live-chat:', '');
        const { type, data } = JSON.parse(message);
        if (type === 'message') {
          liveChat.to(`stream:${streamId}`).emit('chat-message', data);
        }
      } catch (error) {
        console.error('[Live Chat] Redis message error:', error);
      }
    });
  }

  console.log('[Live Chat] WebSocket initialized');
  return liveChat;
}

export default initializeLiveChatWebSocket;
