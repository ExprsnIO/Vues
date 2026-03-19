/**
 * Chat WebSocket Handler
 * Real-time messaging using Socket.IO
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { db, users, messages, conversations, conversationParticipants, userPresence, messageReactions, sessions } from '../db/index.js';
import { eq, and, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getOAuthClient } from '../auth/oauth-client.js';
import { hashSessionToken } from '../utils/session-tokens.js';

type NextFunction = (err?: Error) => void;

// Types
interface UserInfo {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface TypingEvent {
  conversationId: string;
  isTyping: boolean;
}

interface NewMessageEvent {
  id: string;
  conversationId: string;
  sender: UserInfo;
  text: string;
  replyToId?: string;
  embedType?: string;
  embedUri?: string;
  createdAt: string;
  reactions?: Array<{ emoji: string; count: number; users: string[] }>;
}

interface MessageReactionEvent {
  messageId: string;
  conversationId: string;
  userDid: string;
  emoji: string;
  action: 'add' | 'remove';
}

interface PresenceUpdateEvent {
  userDid: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: string;
}

// Redis for presence and pub/sub (optional)
let redis: Redis | null = null;
let redisSub: Redis | null = null;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redisSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
} catch {
  console.warn('Redis not available for chat presence');
}

// Track connected users: userDid -> Set<socketId>
const connectedUsers = new Map<string, Set<string>>();

// Track typing status: conversationId -> Set<userDid>
const typingUsers = new Map<string, Set<string>>();

// Socket to user mapping
const socketToUser = new Map<string, UserInfo>();

// User conversation subscriptions: socketId -> Set<conversationId>
const userConversations = new Map<string, Set<string>>();

/**
 * Update user presence in database
 */
async function updatePresence(userDid: string, status: 'online' | 'away' | 'offline', conversationId?: string): Promise<void> {
  try {
    const now = new Date();
    await db
      .insert(userPresence)
      .values({
        userDid,
        status,
        lastSeen: now,
        currentConversationId: conversationId || null,
      })
      .onConflictDoUpdate({
        target: userPresence.userDid,
        set: {
          status,
          lastSeen: now,
          currentConversationId: conversationId || null,
        },
      });
  } catch (error) {
    console.error('Failed to update presence:', error);
  }
}

/**
 * Check if user can access conversation (direct or group)
 */
async function canAccessConversation(userDid: string, conversationId: string): Promise<boolean> {
  // Check conversationParticipants first (covers direct and group)
  const participant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });
  if (participant) return true;

  // Fall back to direct-conversation participant columns
  const direct = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      )
    ),
  });
  return !!direct;
}

/**
 * Get all participant DIDs for a conversation (direct or group)
 */
async function getParticipantDids(conversationId: string): Promise<string[]> {
  // First try conversationParticipants table
  const rows = await db
    .select({ participantDid: conversationParticipants.participantDid })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));

  if (rows.length > 0) {
    return rows.map((r) => r.participantDid);
  }

  // Fall back to direct-conversation participant columns
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
    columns: { participant1Did: true, participant2Did: true },
  });

  if (!conversation) return [];
  const dids: string[] = [];
  if (conversation.participant1Did) dids.push(conversation.participant1Did);
  if (conversation.participant2Did) dids.push(conversation.participant2Did);
  return dids;
}

/**
 * Get user info for broadcasting
 */
function getUserInfo(socket: Socket): UserInfo {
  return socketToUser.get(socket.id) || {
    did: (socket as any).userDid,
    handle: 'unknown',
  };
}

/**
 * Initialize chat WebSocket namespace
 */
export function initializeChatWebSocket(io: SocketIOServer): void {
  const namespace = io.of('/chat');

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
        // Hash the token to look it up (tokens are stored as hashes)
        const tokenHash = hashSessionToken(token);
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.accessJwt, tokenHash),
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
        displayName: user.displayName || undefined,
        avatar: user.avatar || undefined,
      });

      next();
    } catch (error) {
      console.error('WebSocket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  namespace.on('connection', async (socket: Socket) => {
    const userDid = (socket as any).userDid as string;
    const userInfo = getUserInfo(socket);

    console.log(`Chat: User connected: ${userDid}`);

    // Track connected sockets for this user
    if (!connectedUsers.has(userDid)) {
      connectedUsers.set(userDid, new Set());
    }
    connectedUsers.get(userDid)!.add(socket.id);
    userConversations.set(socket.id, new Set());

    // Update presence to online
    await updatePresence(userDid, 'online');

    // Broadcast presence to all users (could optimize to only relevant conversations)
    socket.broadcast.emit('presence-update', {
      userDid,
      status: 'online',
      lastSeen: new Date().toISOString(),
    } as PresenceUpdateEvent);

    /**
     * Join a conversation room
     */
    socket.on('join-conversation', async (data: { conversationId: string }) => {
      const { conversationId } = data;

      // Verify access
      if (!(await canAccessConversation(userDid, conversationId))) {
        socket.emit('error', { message: 'Access denied to conversation' });
        return;
      }

      socket.join(`conversation:${conversationId}`);
      userConversations.get(socket.id)?.add(conversationId);

      // Update presence with current conversation
      await updatePresence(userDid, 'online', conversationId);

      // Get online status of other participants
      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId),
      });

      if (conversation) {
        // For both direct and group conversations, get all participant DIDs
        const allParticipantDids = await getParticipantDids(conversationId);
        const otherDids = allParticipantDids.filter((did) => did !== userDid);

        const presenceRows = otherDids.length > 0
          ? await db.query.userPresence.findMany({
              where: sql`${userPresence.userDid} IN (${sql.raw(otherDids.map((d) => `'${d}'`).join(','))})`,
            })
          : [];

        const presenceMap = new Map(presenceRows.map((p) => [p.userDid, p]));

        socket.emit('conversation-presence', {
          conversationId,
          participants: otherDids.map((did) => ({
            userDid: did,
            status: presenceMap.get(did)?.status || 'offline',
            lastSeen: presenceMap.get(did)?.lastSeen?.toISOString() || null,
          })),
        });
      }

      // Send typing status for this conversation
      const typingInConversation = typingUsers.get(conversationId);
      if (typingInConversation && typingInConversation.size > 0) {
        socket.emit('typing-status', {
          conversationId,
          typingUsers: Array.from(typingInConversation).filter(did => did !== userDid),
        });
      }

      console.log(`Chat: User ${userDid} joined conversation ${conversationId}`);
    });

    /**
     * Leave a conversation room
     */
    socket.on('leave-conversation', (data: { conversationId: string }) => {
      const { conversationId } = data;
      socket.leave(`conversation:${conversationId}`);
      userConversations.get(socket.id)?.delete(conversationId);

      // Clear typing status
      const typingInConversation = typingUsers.get(conversationId);
      if (typingInConversation) {
        typingInConversation.delete(userDid);
        if (typingInConversation.size === 0) {
          typingUsers.delete(conversationId);
        }
      }
    });

    /**
     * Join a user-level room so the client receives new-message events for
     * ALL conversations without needing to join each conversation room.
     * The web app's global MessagingProvider emits this on connect.
     */
    socket.on('join-user', (data: { userDid: string }) => {
      // Only allow a socket to join its own user room
      if (data.userDid !== userDid) {
        socket.emit('error', { message: 'Cannot join another user\'s room' });
        return;
      }
      socket.join(`user:${userDid}`);
      console.log(`Chat: User ${userDid} joined user room`);
    });

    /**
     * Handle typing indicator
     */
    socket.on('typing', (data: TypingEvent) => {
      const { conversationId, isTyping } = data;

      if (!typingUsers.has(conversationId)) {
        typingUsers.set(conversationId, new Set());
      }

      const typingInConversation = typingUsers.get(conversationId)!;

      if (isTyping) {
        typingInConversation.add(userDid);
      } else {
        typingInConversation.delete(userDid);
      }

      // Broadcast to conversation room (except sender)
      socket.to(`conversation:${conversationId}`).emit('typing-update', {
        conversationId,
        userDid,
        user: userInfo,
        isTyping,
      });
    });

    /**
     * Handle new message (real-time broadcast)
     * Note: The actual message is saved via HTTP API, this just broadcasts
     */
    socket.on('message-sent', async (data: { message: NewMessageEvent }) => {
      const { message } = data;

      // Verify sender matches
      if (message.sender.did !== userDid) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Clear typing status
      const typingInConversation = typingUsers.get(message.conversationId);
      if (typingInConversation) {
        typingInConversation.delete(userDid);
      }

      const conversationRoom = `conversation:${message.conversationId}`;

      // Broadcast to conversation room
      socket.to(conversationRoom).emit('new-message', message);

      // Also notify conversation list updates
      socket.to(conversationRoom).emit('conversation-updated', {
        conversationId: message.conversationId,
        lastMessage: {
          text: message.text,
          createdAt: message.createdAt,
        },
      });

      // Fan out to each participant's user-level room so clients that have
      // called join-user (e.g. the global MessagingProvider) receive the
      // event even if they haven't joined the specific conversation room.
      // .except(conversationRoom) prevents double-delivery to sockets that
      // are already subscribed to the conversation room above.
      // Works for both direct and group conversations.
      try {
        const participantDids = await getParticipantDids(message.conversationId);

        for (const participantDid of participantDids) {
          if (participantDid !== userDid) {
            namespace
              .to(`user:${participantDid}`)
              .except(conversationRoom)
              .emit('new-message', {
                conversationId: message.conversationId,
                message,
                sender: message.sender,
              });
          }
        }
      } catch (error) {
        console.error('Failed to fan out new-message to user rooms:', error);
      }
    });

    /**
     * Handle message reaction
     */
    socket.on('message-reaction', async (data: MessageReactionEvent) => {
      const { messageId, conversationId, emoji, action } = data;

      // Verify access to conversation
      if (!(await canAccessConversation(userDid, conversationId))) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      try {
        if (action === 'add') {
          // Add reaction to database
          await db.insert(messageReactions).values({
            id: nanoid(),
            messageId,
            userDid,
            emoji,
          }).onConflictDoNothing();
        } else {
          // Remove reaction from database
          await db.delete(messageReactions).where(
            and(
              eq(messageReactions.messageId, messageId),
              eq(messageReactions.userDid, userDid),
              eq(messageReactions.emoji, emoji)
            )
          );
        }

        // Broadcast reaction update to conversation
        namespace.to(`conversation:${conversationId}`).emit('reaction-update', {
          messageId,
          conversationId,
          userDid,
          user: userInfo,
          emoji,
          action,
        });
      } catch (error) {
        console.error('Failed to handle reaction:', error);
        socket.emit('error', { message: 'Failed to save reaction' });
      }
    });

    /**
     * Handle message read receipt
     */
    socket.on('message-read', async (data: { conversationId: string; messageId?: string }) => {
      const { conversationId, messageId } = data;

      // Update last read timestamp
      try {
        await db
          .update(conversationParticipants)
          .set({ lastReadAt: new Date() })
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.participantDid, userDid)
            )
          );

        // Broadcast read receipt to other participants
        socket.to(`conversation:${conversationId}`).emit('read-receipt', {
          conversationId,
          userDid,
          messageId,
          readAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to update read status:', error);
      }
    });

    /**
     * Get online users for given DIDs
     */
    socket.on('get-presence', async (data: { userDids: string[] }) => {
      const { userDids } = data;

      if (userDids.length > 100) {
        socket.emit('error', { message: 'Too many users requested' });
        return;
      }

      try {
        const presenceData = await db.query.userPresence.findMany({
          where: sql`${userPresence.userDid} IN (${userDids.map(d => `'${d}'`).join(',')})`,
        });

        const presenceMap = new Map(presenceData.map(p => [p.userDid, p]));

        socket.emit('presence-data', {
          users: userDids.map(did => ({
            userDid: did,
            status: presenceMap.get(did)?.status || 'offline',
            lastSeen: presenceMap.get(did)?.lastSeen?.toISOString() || null,
          })),
        });
      } catch (error) {
        console.error('Failed to get presence:', error);
      }
    });

    /**
     * Handle disconnection
     */
    socket.on('disconnect', async () => {
      console.log(`Chat: User disconnected: ${userDid}`);

      // Remove socket from tracking
      const userSockets = connectedUsers.get(userDid);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedUsers.delete(userDid);

          // User has no more connected sockets, update to offline
          await updatePresence(userDid, 'offline');

          // Broadcast offline status
          socket.broadcast.emit('presence-update', {
            userDid,
            status: 'offline',
            lastSeen: new Date().toISOString(),
          } as PresenceUpdateEvent);
        }
      }

      // Clear typing status from all conversations
      const conversationIds = userConversations.get(socket.id);
      if (conversationIds) {
        for (const conversationId of conversationIds) {
          const typingInConversation = typingUsers.get(conversationId);
          if (typingInConversation) {
            typingInConversation.delete(userDid);
            socket.to(`conversation:${conversationId}`).emit('typing-update', {
              conversationId,
              userDid,
              isTyping: false,
            });
          }
        }
      }

      // Cleanup
      socketToUser.delete(socket.id);
      userConversations.delete(socket.id);
    });
  });

  // Periodic presence cleanup (mark stale users as offline)
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

      await db
        .update(userPresence)
        .set({ status: 'offline' })
        .where(
          and(
            sql`${userPresence.status} != 'offline'`,
            sql`${userPresence.lastSeen} < ${staleThreshold.toISOString()}`
          )
        );
    } catch (error) {
      console.error('Presence cleanup error:', error);
    }
  }, 60 * 1000); // Every minute
}

/**
 * Get chat statistics
 */
export function getChatStats(): {
  connectedUsers: number;
  totalSockets: number;
  activeConversations: number;
} {
  let totalSockets = 0;
  for (const sockets of connectedUsers.values()) {
    totalSockets += sockets.size;
  }

  const activeConversations = new Set<string>();
  for (const convs of userConversations.values()) {
    for (const conv of convs) {
      activeConversations.add(conv);
    }
  }

  return {
    connectedUsers: connectedUsers.size,
    totalSockets,
    activeConversations: activeConversations.size,
  };
}

export default initializeChatWebSocket;
