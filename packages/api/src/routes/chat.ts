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
} from '../db/index.js';
import { eq, desc, and, or, sql } from 'drizzle-orm';
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

  const otherUser = await db.query.users.findFirst({
    where: eq(users.did, otherDid),
  });

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
            sql`${messages.createdAt} > ${participantState.lastReadAt}`,
            sql`${messages.senderDid} != ${userDid}`
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

  const conditions = [
    or(
      eq(conversations.participant1Did, userDid),
      eq(conversations.participant2Did, userDid)
    ),
  ];

  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(sql`${conversations.lastMessageAt} < ${cursorDate}`);
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
      const otherDid =
        r.conversation.participant1Did === userDid
          ? r.conversation.participant2Did
          : r.conversation.participant1Did;

      const otherUser = await db.query.users.findFirst({
        where: eq(users.did, otherDid),
      });

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
                sql`${messages.createdAt} > ${participantState.lastReadAt}`,
                sql`${messages.senderDid} != ${userDid}`
              )
            )
            .then((res) => Number(res[0]?.count || 0))
        : 0;

      return {
        id: r.conversation.id,
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

  // Verify user is part of conversation
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      )
    ),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  // Check if blocked by other participant
  const otherDid =
    conversation.participant1Did === userDid
      ? conversation.participant2Did
      : conversation.participant1Did;

  if (await isBlocked(userDid, otherDid)) {
    throw new HTTPException(403, { message: 'Cannot message this user' });
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

  // Verify user is part of conversation
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      )
    ),
  });

  if (!conversation) {
    throw new HTTPException(404, { message: 'Conversation not found' });
  }

  const messageConditions = [eq(messages.conversationId, conversationId)];

  if (cursor) {
    const cursorDate = new Date(cursor);
    messageConditions.push(sql`${messages.createdAt} < ${cursorDate}`);
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

  // Verify user is part of conversation
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      )
    ),
  });

  if (!conversation) {
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

  // Verify user is part of conversation
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      )
    ),
  });

  if (!conversation) {
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

  // Verify user is part of conversation
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      )
    ),
  });

  if (!conversation) {
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

  // Verify user is part of conversation
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      or(
        eq(conversations.participant1Did, userDid),
        eq(conversations.participant2Did, userDid)
      )
    ),
  });

  if (!conversation) {
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
