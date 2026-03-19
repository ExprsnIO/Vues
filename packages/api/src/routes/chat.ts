import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import {
  db,
  users,
  conversations,
  messages,
  conversationParticipants,
  blocks,
  messageReactions,
  userPresence,
} from '../db/index.js';
import { eq, desc, and, or, sql, lt, gt, ne, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { isBlocked } from './social.js';

export const chatRouter = new Hono();

// =============================================================================
// Conversation Endpoints
// =============================================================================

/**
 * Get or create a conversation with another user
 * POST /xrpc/io.exprsn.chat.getOrCreateConversation
 */
chatRouter.post('/io.exprsn.chat.getOrCreateConversation', authMiddleware, async (c) => {
  const { did } = await c.req.json();
  const userDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  if (did === userDid) {
    throw new HTTPException(400, { message: 'Cannot start conversation with yourself' });
  }

  // Check if blocked
  if (await isBlocked(userDid, did)) {
    throw new HTTPException(403, { message: 'Cannot message this user' });
  }

  // Normalize participant order for consistent lookup
  const [participant1, participant2] = [userDid, did].sort();

  // Check for existing conversation
  let conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.participant1Did, participant1),
      eq(conversations.participant2Did, participant2)
    ),
  });

  if (!conversation) {
    // Create new conversation
    const conversationId = nanoid();

    await db.insert(conversations).values({
      id: conversationId,
      participant1Did: participant1,
      participant2Did: participant2,
    });

    // Create participant records
    await db.insert(conversationParticipants).values([
      {
        id: nanoid(),
        conversationId,
        participantDid: participant1,
      },
      {
        id: nanoid(),
        conversationId,
        participantDid: participant2,
      },
    ]);

    conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
  }

  // Get other participant's info
  const otherDid = conversation!.participant1Did === userDid
    ? conversation!.participant2Did
    : conversation!.participant1Did;

  const otherUser = otherDid
    ? await db.query.users.findFirst({ where: eq(users.did, otherDid) })
    : null;

  // Get participant state for current user
  const participantState = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversation!.id),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });

  // Count unread messages
  const unreadCount = participantState?.lastReadAt
    ? await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation!.id),
            gt(messages.createdAt, participantState.lastReadAt),
            ne(messages.senderDid, userDid)
          )
        )
        .then((r) => Number(r[0]?.count || 0))
    : 0;

  return c.json({
    conversation: {
      id: conversation!.id,
      members: [
        {
          did: otherUser?.did,
          handle: otherUser?.handle,
          displayName: otherUser?.displayName,
          avatar: otherUser?.avatar,
        },
      ],
      lastMessage: conversation!.lastMessageText
        ? {
            text: conversation!.lastMessageText,
            createdAt: conversation!.lastMessageAt?.toISOString(),
          }
        : null,
      unreadCount,
      muted: participantState?.muted || false,
      createdAt: conversation!.createdAt.toISOString(),
      updatedAt: conversation!.updatedAt.toISOString(),
    },
  });
});

/**
 * Get all conversations
 * GET /xrpc/io.exprsn.chat.getConversations
 */
chatRouter.get('/io.exprsn.chat.getConversations', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  // Find all conversation IDs the user is a participant in
  const participantRows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.participantDid, userDid));

  const participantConversationIds = participantRows.map((r) => r.conversationId);

  // Build conditions: direct conversations by participant columns OR group conversations by participant table
  const membershipCondition = participantConversationIds.length > 0
    ? or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid),
        sql`${conversations.id} IN (${sql.raw(participantConversationIds.map((id) => `'${id}'`).join(','))})`
      )
    : or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      );

  const conditions = [membershipCondition!];

  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(lt(conversations.lastMessageAt, cursorDate));
  }

  const results = await db
    .select({
      conversation: conversations,
    })
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);

  // Hydrate with participant info
  const hydratedConversations = await Promise.all(
    results.map(async (r) => {
      const participantState = await db.query.conversationParticipants.findFirst({
        where: and(
          eq(conversationParticipants.conversationId, r.conversation.id),
          eq(conversationParticipants.participantDid, userDid)
        ),
      });

      // Count unread
      const unreadCount = participantState?.lastReadAt
        ? await db
            .select({ count: sql<number>`count(*)` })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, r.conversation.id),
                gt(messages.createdAt, participantState.lastReadAt),
                ne(messages.senderDid, userDid)
              )
            )
            .then((res) => Number(res[0]?.count || 0))
        : 0;

      const isGroup = r.conversation.type === 'group';

      if (isGroup) {
        // For groups: get member count and return group metadata
        const memberCountResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.conversationId, r.conversation.id))
          .then((res) => Number(res[0]?.count || 0));

        return {
          id: r.conversation.id,
          type: 'group' as const,
          name: r.conversation.name,
          avatarUrl: r.conversation.avatarUrl,
          memberCount: memberCountResult,
          lastMessage: r.conversation.lastMessageText
            ? {
                text: r.conversation.lastMessageText,
                createdAt: r.conversation.lastMessageAt?.toISOString(),
              }
            : null,
          unreadCount,
          muted: participantState?.muted || false,
          createdAt: r.conversation.createdAt.toISOString(),
          updatedAt: r.conversation.updatedAt.toISOString(),
        };
      }

      // Direct conversation: hydrate other participant
      const otherDid =
        r.conversation.participant1Did === userDid
          ? r.conversation.participant2Did
          : r.conversation.participant1Did;

      const otherUser = otherDid
        ? await db.query.users.findFirst({ where: eq(users.did, otherDid) })
        : null;

      return {
        id: r.conversation.id,
        type: 'direct' as const,
        members: [
          {
            did: otherUser?.did,
            handle: otherUser?.handle,
            displayName: otherUser?.displayName,
            avatar: otherUser?.avatar,
          },
        ],
        lastMessage: r.conversation.lastMessageText
          ? {
              text: r.conversation.lastMessageText,
              createdAt: r.conversation.lastMessageAt?.toISOString(),
            }
          : null,
        unreadCount,
        muted: participantState?.muted || false,
        createdAt: r.conversation.createdAt.toISOString(),
        updatedAt: r.conversation.updatedAt.toISOString(),
      };
    })
  );

  const lastResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastResult?.conversation.lastMessageAt
      ? lastResult.conversation.lastMessageAt.toISOString()
      : undefined;

  return c.json({
    conversations: hydratedConversations,
    cursor: nextCursor,
  });
});

// =============================================================================
// Message Endpoints
// =============================================================================

/**
 * Send a message
 * POST /xrpc/io.exprsn.chat.sendMessage
 */
chatRouter.post('/io.exprsn.chat.sendMessage', authMiddleware, async (c) => {
  const { conversationId, text, replyToId, embedType, embedUri } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId || !text) {
    throw new HTTPException(400, { message: 'Conversation ID and text are required' });
  }

  if (text.length > 2000) {
    throw new HTTPException(400, { message: 'Message too long (max 2000 characters)' });
  }

  // Verify user is part of conversation (direct or group)
  const participantRecord = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });

  // Also allow direct conversations where participant columns are used
  const directConversation = !participantRecord
    ? await db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, conversationId),
          or(
            eq(conversations.participant1Did, userDid),
            eq(conversations.participant2Did, userDid)
          )
        ),
      })
    : null;

  if (!participantRecord && !directConversation) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  // For direct conversations, check if blocked by the other participant
  if (conversation.type === 'direct') {
    const otherDid =
      conversation.participant1Did === userDid
        ? conversation.participant2Did
        : conversation.participant1Did;

    if (otherDid && (await isBlocked(userDid, otherDid))) {
      throw new HTTPException(403, { message: 'Cannot message this user' });
    }
  }

  const messageId = nanoid();

  await db.insert(messages).values({
    id: messageId,
    conversationId,
    senderDid: userDid,
    text,
    replyToId: replyToId || null,
    embedType: embedType || null,
    embedUri: embedUri || null,
  });

  // Update conversation
  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessageText: text.substring(0, 100),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  // Get sender info
  const sender = await db.query.users.findFirst({
    where: eq(users.did, userDid),
  });

  return c.json({
    message: {
      id: messageId,
      sender: {
        did: sender?.did,
        handle: sender?.handle,
        displayName: sender?.displayName,
        avatar: sender?.avatar,
      },
      text,
      replyToId,
      embedType,
      embedUri,
      read: false,
      createdAt: new Date().toISOString(),
    },
  });
});

/**
 * Get messages in a conversation
 * GET /xrpc/io.exprsn.chat.getMessages
 */
chatRouter.get('/io.exprsn.chat.getMessages', authMiddleware, async (c) => {
  const conversationId = c.req.query('conversationId');
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  if (!conversationId) {
    throw new HTTPException(400, { message: 'Conversation ID is required' });
  }

  // Verify user is part of conversation (direct or group)
  const getMessagesConversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  if (!getMessagesConversation) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  // Check membership: direct by participant columns, group by participant table
  const isDirectMember =
    getMessagesConversation.participant1Did === userDid ||
    getMessagesConversation.participant2Did === userDid;

  const isGroupMember = !isDirectMember
    ? !!(await db.query.conversationParticipants.findFirst({
        where: and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.participantDid, userDid)
        ),
      }))
    : false;

  if (!isDirectMember && !isGroupMember) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  const messageConditions = [eq(messages.conversationId, conversationId)];

  if (cursor) {
    const cursorDate = new Date(cursor);
    messageConditions.push(lt(messages.createdAt, cursorDate));
  }

  const results = await db
    .select({
      message: messages,
    })
    .from(messages)
    .where(and(...messageConditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Get unique sender DIDs
  const senderDids = [...new Set(results.map((r) => r.message.senderDid))];
  const senders = senderDids.length > 0
    ? await db.query.users.findMany({
        where: sql`${users.did} IN ${senderDids}`,
      })
    : [];

  const senderMap = new Map(senders.map((s) => [s.did, s]));

  // Mark messages as read
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.participantDid, userDid)
      )
    );

  const lastMessageResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastMessageResult
      ? lastMessageResult.message.createdAt.toISOString()
      : undefined;

  return c.json({
    messages: results.map((r) => {
      const sender = senderMap.get(r.message.senderDid);
      return {
        id: r.message.id,
        sender: {
          did: sender?.did,
          handle: sender?.handle,
          displayName: sender?.displayName,
          avatar: sender?.avatar,
        },
        text: r.message.text,
        replyToId: r.message.replyToId,
        embedType: r.message.embedType,
        embedUri: r.message.embedUri,
        read: r.message.readAt !== null,
        createdAt: r.message.createdAt.toISOString(),
      };
    }),
    cursor: nextCursor,
  });
});

/**
 * Mark messages as read
 * POST /xrpc/io.exprsn.chat.markRead
 */
chatRouter.post('/io.exprsn.chat.markRead', authMiddleware, async (c) => {
  const { conversationId } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId) {
    throw new HTTPException(400, { message: 'Conversation ID is required' });
  }

  // Verify user is part of conversation (direct or group)
  if (!(await isMember(userDid, conversationId))) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.participantDid, userDid)
      )
    );

  return c.json({ success: true });
});

/**
 * Mute/unmute a conversation
 * POST /xrpc/io.exprsn.chat.muteConversation
 */
chatRouter.post('/io.exprsn.chat.muteConversation', authMiddleware, async (c) => {
  const { conversationId, muted } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId || typeof muted !== 'boolean') {
    throw new HTTPException(400, { message: 'Conversation ID and muted flag are required' });
  }

  // Verify user is part of conversation (direct or group)
  if (!(await isMember(userDid, conversationId))) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  await db
    .update(conversationParticipants)
    .set({ muted })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.participantDid, userDid)
      )
    );

  return c.json({ success: true, muted });
});

/**
 * Delete a message (must be the sender)
 * POST /xrpc/io.exprsn.chat.deleteMessage
 */
chatRouter.post('/io.exprsn.chat.deleteMessage', authMiddleware, async (c) => {
  const { conversationId, messageId } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId || !messageId) {
    throw new HTTPException(400, { message: 'Conversation ID and message ID are required' });
  }

  // Verify user is part of conversation (direct or group)
  if (!(await isMember(userDid, conversationId))) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  // Find the message
  const message = await db.query.messages.findFirst({
    where: and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)),
  });

  if (!message) {
    throw new HTTPException(404, { message: 'Message not found' });
  }

  // Only the sender can delete their message
  if (message.senderDid !== userDid) {
    throw new HTTPException(403, { message: 'Not authorized to delete this message' });
  }

  // Delete the message
  await db.delete(messages).where(eq(messages.id, messageId));

  // If this was the last message, update conversation's lastMessageText
  const lastMessage = await db.query.messages.findFirst({
    where: eq(messages.conversationId, conversationId),
    orderBy: desc(messages.createdAt),
  });

  if (lastMessage) {
    await db
      .update(conversations)
      .set({
        lastMessageText: lastMessage.text.substring(0, 100),
        lastMessageAt: lastMessage.createdAt,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
  } else {
    await db
      .update(conversations)
      .set({
        lastMessageText: null,
        lastMessageAt: null,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
  }

  return c.json({ success: true });
});

/**
 * Delete/leave a conversation (removes it from user's view)
 * POST /xrpc/io.exprsn.chat.deleteConversation
 */
chatRouter.post('/io.exprsn.chat.deleteConversation', authMiddleware, async (c) => {
  const { conversationId } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId) {
    throw new HTTPException(400, { message: 'Conversation ID is required' });
  }

  // Verify user is part of conversation (direct or group)
  if (!(await isMember(userDid, conversationId))) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  // For now, we'll actually delete the conversation if both participants delete
  // In a more complete implementation, you'd track deleted state per participant

  // Delete all messages in the conversation
  await db.delete(messages).where(eq(messages.conversationId, conversationId));

  // Delete participant records
  await db.delete(conversationParticipants).where(
    eq(conversationParticipants.conversationId, conversationId)
  );

  // Delete the conversation
  await db.delete(conversations).where(eq(conversations.id, conversationId));

  return c.json({ success: true });
});

// =============================================================================
// Message Reactions Endpoints
// =============================================================================

/**
 * Add a reaction to a message
 * POST /xrpc/io.exprsn.chat.addReaction
 */
chatRouter.post('/io.exprsn.chat.addReaction', authMiddleware, async (c) => {
  const { messageId, emoji } = await c.req.json();
  const userDid = c.get('did');

  if (!messageId || !emoji) {
    throw new HTTPException(400, { message: 'Message ID and emoji are required' });
  }

  // Validate emoji (basic check for common emojis)
  if (emoji.length > 10) {
    throw new HTTPException(400, { message: 'Invalid emoji' });
  }

  // Find the message and verify access
  const message = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });

  if (!message) {
    throw new HTTPException(404, { message: 'Message not found' });
  }

  // Verify user is part of the conversation (direct or group)
  if (!(await isMember(userDid, message.conversationId))) {
    throw new HTTPException(403, { message: 'Not authorized to react to this message' });
  }

  // Add reaction (or ignore if already exists)
  const reactionId = nanoid();
  await db
    .insert(messageReactions)
    .values({
      id: reactionId,
      messageId,
      userDid,
      emoji,
    })
    .onConflictDoNothing();

  // Get updated reaction counts for this message
  const reactions = await getMessageReactions(messageId);

  return c.json({ success: true, reactions });
});

/**
 * Remove a reaction from a message
 * POST /xrpc/io.exprsn.chat.removeReaction
 */
chatRouter.post('/io.exprsn.chat.removeReaction', authMiddleware, async (c) => {
  const { messageId, emoji } = await c.req.json();
  const userDid = c.get('did');

  if (!messageId || !emoji) {
    throw new HTTPException(400, { message: 'Message ID and emoji are required' });
  }

  // Find the message
  const message = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });

  if (!message) {
    throw new HTTPException(404, { message: 'Message not found' });
  }

  // Remove the reaction
  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userDid, userDid),
        eq(messageReactions.emoji, emoji)
      )
    );

  // Get updated reaction counts
  const reactions = await getMessageReactions(messageId);

  return c.json({ success: true, reactions });
});

/**
 * Get reactions for messages in a conversation
 * GET /xrpc/io.exprsn.chat.getReactions
 */
chatRouter.get('/io.exprsn.chat.getReactions', authMiddleware, async (c) => {
  const messageIds = c.req.query('messageIds')?.split(',') || [];
  const userDid = c.get('did');

  if (messageIds.length === 0 || messageIds.length > 100) {
    throw new HTTPException(400, { message: 'Provide 1-100 message IDs' });
  }

  // Get reactions for all messages
  const reactionsMap: Record<string, Array<{ emoji: string; count: number; users: string[]; userReacted: boolean }>> = {};

  for (const messageId of messageIds) {
    reactionsMap[messageId] = await getMessageReactions(messageId, userDid);
  }

  return c.json({ reactions: reactionsMap });
});

/**
 * Get user presence status
 * GET /xrpc/io.exprsn.chat.getPresence
 */
chatRouter.get('/io.exprsn.chat.getPresence', authMiddleware, async (c) => {
  const userDids = c.req.query('userDids')?.split(',') || [];

  if (userDids.length === 0 || userDids.length > 50) {
    throw new HTTPException(400, { message: 'Provide 1-50 user DIDs' });
  }

  const presenceData = await db.query.userPresence.findMany({
    where: sql`${userPresence.userDid} IN (${sql.raw(userDids.map(d => `'${d}'`).join(','))})`,
  });

  const presenceMap = new Map(presenceData.map(p => [p.userDid, p]));

  return c.json({
    presence: userDids.map(did => ({
      userDid: did,
      status: presenceMap.get(did)?.status || 'offline',
      lastSeen: presenceMap.get(did)?.lastSeen?.toISOString() || null,
    })),
  });
});

// =============================================================================
// Group Chat Endpoints
// =============================================================================

/**
 * Create a group conversation
 * POST /xrpc/io.exprsn.chat.createGroup
 */
chatRouter.post('/io.exprsn.chat.createGroup', authMiddleware, async (c) => {
  const { name, memberDids, avatarUrl } = await c.req.json();
  const userDid = c.get('did');

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new HTTPException(400, { message: 'Group name is required' });
  }

  if (!Array.isArray(memberDids) || memberDids.length === 0) {
    throw new HTTPException(400, { message: 'At least one member DID is required' });
  }

  const maxMembers = 50;
  // Total participants = creator + memberDids
  const allDids = Array.from(new Set([...memberDids, userDid]));

  if (allDids.length > maxMembers) {
    throw new HTTPException(400, {
      message: `Group cannot exceed ${maxMembers} members`,
    });
  }

  const conversationId = nanoid();

  await db.insert(conversations).values({
    id: conversationId,
    type: 'group',
    name: name.trim(),
    avatarUrl: avatarUrl || null,
    createdBy: userDid,
    maxMembers,
  });

  // Insert all participant records; creator gets admin role
  const participantValues = allDids.map((did) => ({
    id: nanoid(),
    conversationId,
    participantDid: did,
    role: did === userDid ? 'admin' : 'member',
  }));

  await db.insert(conversationParticipants).values(participantValues);

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  return c.json({ conversation }, 201);
});

/**
 * Add a member to a group conversation
 * POST /xrpc/io.exprsn.chat.addGroupMember
 */
chatRouter.post('/io.exprsn.chat.addGroupMember', authMiddleware, async (c) => {
  const { conversationId, memberDid } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId || !memberDid) {
    throw new HTTPException(400, { message: 'Conversation ID and member DID are required' });
  }

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.type, 'group')),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Group conversation not found' });
  }

  // Caller must be an admin
  const callerParticipant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });

  if (!callerParticipant || callerParticipant.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only group admins can add members' });
  }

  // Check member limit
  const currentCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId))
    .then((r) => Number(r[0]?.count || 0));

  const maxMembers = conversation.maxMembers ?? 50;
  if (currentCountResult >= maxMembers) {
    throw new HTTPException(400, { message: `Group has reached the maximum of ${maxMembers} members` });
  }

  // Check if already a member
  const existing = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, memberDid)
    ),
  });

  if (existing) {
    return c.json({ success: true, alreadyMember: true });
  }

  await db.insert(conversationParticipants).values({
    id: nanoid(),
    conversationId,
    participantDid: memberDid,
    role: 'member',
  });

  return c.json({ success: true });
});

/**
 * Remove a member from a group conversation
 * POST /xrpc/io.exprsn.chat.removeGroupMember
 */
chatRouter.post('/io.exprsn.chat.removeGroupMember', authMiddleware, async (c) => {
  const { conversationId, memberDid } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId || !memberDid) {
    throw new HTTPException(400, { message: 'Conversation ID and member DID are required' });
  }

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.type, 'group')),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Group conversation not found' });
  }

  const callerParticipant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });

  if (!callerParticipant) {
    throw new HTTPException(403, { message: 'You are not a member of this group' });
  }

  // Admins can remove anyone; members can only remove themselves
  if (callerParticipant.role !== 'admin' && memberDid !== userDid) {
    throw new HTTPException(403, { message: 'Only group admins can remove other members' });
  }

  await db
    .delete(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.participantDid, memberDid)
      )
    );

  return c.json({ success: true });
});

/**
 * Update group metadata (name, avatar)
 * POST /xrpc/io.exprsn.chat.updateGroup
 */
chatRouter.post('/io.exprsn.chat.updateGroup', authMiddleware, async (c) => {
  const { conversationId, name, avatarUrl } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId) {
    throw new HTTPException(400, { message: 'Conversation ID is required' });
  }

  if (name === undefined && avatarUrl === undefined) {
    throw new HTTPException(400, { message: 'At least one of name or avatarUrl must be provided' });
  }

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.type, 'group')),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Group conversation not found' });
  }

  // Only admins can update group metadata
  const callerParticipant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });

  if (!callerParticipant || callerParticipant.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only group admins can update group details' });
  }

  const updates: { name?: string; avatarUrl?: string; updatedAt: Date } = { updatedAt: new Date() };
  if (name !== undefined) updates.name = (name as string).trim();
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl as string;

  await db
    .update(conversations)
    .set(updates)
    .where(eq(conversations.id, conversationId));

  const updatedConversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  return c.json({ conversation: updatedConversation });
});

/**
 * Set a member's role within a group
 * POST /xrpc/io.exprsn.chat.setGroupRole
 */
chatRouter.post('/io.exprsn.chat.setGroupRole', authMiddleware, async (c) => {
  const { conversationId, memberDid, role } = await c.req.json();
  const userDid = c.get('did');

  if (!conversationId || !memberDid || !role) {
    throw new HTTPException(400, { message: 'Conversation ID, member DID, and role are required' });
  }

  if (role !== 'admin' && role !== 'member') {
    throw new HTTPException(400, { message: 'Role must be "admin" or "member"' });
  }

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.type, 'group')),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Group conversation not found' });
  }

  // Only admins can change roles
  const callerParticipant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });

  if (!callerParticipant || callerParticipant.role !== 'admin') {
    throw new HTTPException(403, { message: 'Only group admins can change member roles' });
  }

  // If demoting from admin, ensure at least one admin remains
  if (role === 'member') {
    const adminCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.role, 'admin')
        )
      )
      .then((r) => Number(r[0]?.count || 0));

    if (adminCountResult <= 1 && memberDid !== userDid) {
      // Fine — we are demoting someone else while the caller is still an admin
    } else if (adminCountResult <= 1 && memberDid === userDid) {
      throw new HTTPException(400, { message: 'Cannot demote the last admin' });
    }
  }

  const targetParticipant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, memberDid)
    ),
  });

  if (!targetParticipant) {
    throw new HTTPException(404, { message: 'Member not found in this group' });
  }

  await db
    .update(conversationParticipants)
    .set({ role })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.participantDid, memberDid)
      )
    );

  return c.json({ success: true, memberDid, role });
});

/**
 * Get members of a group conversation
 * GET /xrpc/io.exprsn.chat.getGroupMembers
 */
chatRouter.get('/io.exprsn.chat.getGroupMembers', authMiddleware, async (c) => {
  const conversationId = c.req.query('conversationId');
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  if (!conversationId) {
    throw new HTTPException(400, { message: 'Conversation ID is required' });
  }

  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, conversationId), eq(conversations.type, 'group')),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Group conversation not found' });
  }

  // Caller must be a member
  if (!(await isMember(userDid, conversationId))) {
    throw new HTTPException(403, { message: 'You are not a member of this group' });
  }

  const participantConditions: Parameters<typeof and>[0][] = [
    eq(conversationParticipants.conversationId, conversationId),
  ];

  if (cursor) {
    const cursorDate = new Date(cursor);
    participantConditions.push(gt(conversationParticipants.createdAt, cursorDate));
  }

  const participantRows = await db
    .select()
    .from(conversationParticipants)
    .where(and(...participantConditions))
    .orderBy(conversationParticipants.createdAt)
    .limit(limit + 1); // fetch one extra to determine if there's a next page

  const hasMore = participantRows.length > limit;
  const rows = hasMore ? participantRows.slice(0, limit) : participantRows;

  // Hydrate with user info
  const memberDids = rows.map((r) => r.participantDid);
  const memberUsers =
    memberDids.length > 0
      ? await db.query.users.findMany({
          where: sql`${users.did} IN (${sql.raw(memberDids.map((d) => `'${d}'`).join(','))})`,
        })
      : [];

  const userMap = new Map(memberUsers.map((u) => [u.did, u]));

  // Get total member count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId))
    .then((r) => Number(r[0]?.count || 0));

  const nextCursor =
    hasMore ? rows[rows.length - 1]!.createdAt.toISOString() : undefined;

  return c.json({
    members: rows.map((r) => {
      const user = userMap.get(r.participantDid);
      return {
        did: r.participantDid,
        handle: user?.handle,
        displayName: user?.displayName,
        avatar: user?.avatar,
        role: r.role,
        joinedAt: r.createdAt.toISOString(),
      };
    }),
    total: totalResult,
    cursor: nextCursor,
  });
});

// Helper: check whether a user is a member of a conversation (direct or group)
async function isMember(userDid: string, conversationId: string): Promise<boolean> {
  // Check the conversationParticipants table first (covers both direct and group)
  const participant = await db.query.conversationParticipants.findFirst({
    where: and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.participantDid, userDid)
    ),
  });
  if (participant) return true;

  // Fall back to direct-conversation participant columns (legacy / newly created direct convos)
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

// Helper function to get reactions for a message
async function getMessageReactions(
  messageId: string,
  currentUserDid?: string
): Promise<Array<{ emoji: string; count: number; users: string[]; userReacted: boolean }>> {
  const reactions = await db.query.messageReactions.findMany({
    where: eq(messageReactions.messageId, messageId),
  });

  // Group by emoji
  const emojiGroups = new Map<string, string[]>();
  for (const reaction of reactions) {
    if (!emojiGroups.has(reaction.emoji)) {
      emojiGroups.set(reaction.emoji, []);
    }
    emojiGroups.get(reaction.emoji)!.push(reaction.userDid);
  }

  return Array.from(emojiGroups.entries()).map(([emoji, userDids]) => ({
    emoji,
    count: userDids.length,
    users: userDids.slice(0, 10), // Limit to 10 users per reaction
    userReacted: currentUserDid ? userDids.includes(currentUserDid) : false,
  }));
}
